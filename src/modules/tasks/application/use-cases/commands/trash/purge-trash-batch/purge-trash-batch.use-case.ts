import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { erasureActorOf } from '../../../../../domain/policies/trash/trash-entry.policy.js';
import { purgeDueBefore } from '../../../../../domain/policies/trash/trash-retention.policy.js';
import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TrashEntryErasure } from '../../../../models/trash/trash-entry-erasure.model.js';
import type { TrashEntryRecord } from '../../../../models/trash/trash-entry-record.model.js';
import type { TrashErasureCounts } from '../../../../models/trash/trash-erasure-counts.model.js';
import type { TrashTreeNode } from '../../../../models/trash/trash-tree-node.model.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TrashEraser } from '../../../../services/trash/trash-eraser.service.js';
import type { PurgeTrashBatchInput } from './purge-trash-batch.input.js';
import type { PurgeTrashBatchOutput } from './purge-trash-batch.output.js';

/**
 * Constant MAX_ENTRIES
 *
 * @description
 * How many entries one batch locks at most.
 *
 * @type {number}
 */
const MAX_ENTRIES: number = 20;

/**
 * Constant MAX_TASKS
 *
 * @description
 * The budget of a batch, in tasks: it takes whole entries of 500 tasks or fewer while the entries
 * taken hold fewer than 500 tasks, so a batch erases 999 tasks at most (499, then one entry of
 * 500), and erases an entry larger than this in parts of exactly this many tasks.
 *
 * @type {number}
 */
const MAX_TASKS: number = 500;

/**
 * Class PurgeTrashBatch
 *
 * @description
 * One batch of the erasure of the trash of an organization (decision 11 of the P3b-1 brief;
 * "Erasing" of `openapi/public/trash.yaml`: "An entry is erased for good 30 days after its
 * deletion, by a daily job in bounded batches, or before by ... 'Vider la corbeille'"), in the
 * tenant transaction of its caller, the purge job of the deletion-lifecycle module, or in its own.
 *
 * It locks the entries "Vider la corbeille" handed over first (the oldest hand-over first), else
 * the entries still in the trash whose purge date passed (deleted at or before the transaction
 * instant less 30 days, `purgeDueBefore`, the oldest first), 20 at most, `FOR UPDATE SKIP LOCKED`,
 * so two jobs of one organization share them.
 *
 * - When the first entry holds more than 500 tasks (`task_count`; its archived subtasks are not
 *   limited), the batch erases a part of it alone: its tasks are read from their stored parent
 *   links in one recursive statement (`entryTree`, cycles detected), the 500 deepest (then by id)
 *   are locked `FOR UPDATE` in one statement by id (`lockEntryTasks`) and erased in the statements
 *   of an erasure scoped to them (`TrashEraser.erasePart`: one `task.purged.v1` each, its parent
 *   key as stored, the tasks of other entries under them detached), and the entry row stays, its
 *   count lowered, handed to the purge as task-service when it was due (a hand-over keeps its
 *   requester): out of the trash from that first part on. A later batch goes on with it (an entry
 *   handed over comes before the entries due), and erases it whole once 500 tasks or fewer are
 *   left.
 * - Otherwise it takes the entries in their order while the entries taken hold fewer than 500
 *   tasks, each of 500 tasks or fewer (it stops at an entry larger than that, which a later batch
 *   erases in parts when it comes first), so it erases 999 tasks at most; the entries locked and
 *   not taken wait for the next batch. It locks the tasks of all the entries taken `FOR UPDATE` in
 *   one statement ordered by id (`trash_entry_id = any($entries)`, `lockTrashEntries`), and the
 *   eraser emits one `task.purged.v1` per task, erases them, and erases the deleted lists and
 *   spaces they leave without a task.
 *
 * The actor is the requester of "Vider la corbeille" for an entry handed over, and
 * `{ type: 'system', id: 'task-service' }` for an entry due (`erasureActorOf`). A failed batch
 * rolls back alone.
 */
export class PurgeTrashBatch {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** Erases the entries. */
  private readonly eraser: TrashEraser;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the spaces directory.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(unitOfWork: TasksUnitOfWork, spaces: SpaceDirectory) {
    this.unitOfWork = unitOfWork;
    this.eraser = new TrashEraser(spaces);
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Runs one batch.
   *
   * @param {PurgeTrashBatchInput} input - The organization.
   * @returns {Promise<PurgeTrashBatchOutput>} What the batch erased.
   * @throws {Error} When an entry has no root, its tree holds a cycle, or a task vanished: defects,
   * which roll the batch back.
   */
  public async execute(input: PurgeTrashBatchInput): Promise<PurgeTrashBatchOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<PurgeTrashBatchOutput> => {
      const { organizationId } = input;
      const entries: readonly TrashEntryRecord[] = await this.lockEntries(store, organizationId);
      const first: TrashEntryRecord | undefined = entries[0];
      if (first === undefined) {
        return { outcome: 'none-left' };
      }
      if (first.taskCount > MAX_TASKS) {
        const tasks: number = await this.erasePart(store, organizationId, first);
        return { outcome: 'purged', entries: 0, tasks, listsPurged: 0, spacesPurged: 0 };
      }
      const taken: readonly TrashEntryRecord[] = this.take(entries);
      const tasks: readonly Task[] = await store.tasks.lockTrashEntries(
        organizationId,
        taken.map((entry: TrashEntryRecord): string => entry.id),
        true,
      );
      const erasures: readonly TrashEntryErasure[] = taken.map(
        (entry: TrashEntryRecord): TrashEntryErasure => ({
          entry,
          tasks: tasks.filter((task: Task): boolean => task.snapshot.trash?.entryId === entry.id),
          actor: this.actorOf(entry),
        }),
      );
      const counts: TrashErasureCounts = await this.eraser.erase(store, organizationId, erasures);
      return {
        outcome: 'purged',
        entries: erasures.length,
        tasks: counts.tasks,
        listsPurged: counts.listsPurged,
        spacesPurged: counts.spacesPurged,
      };
    });
  }

  /**
   * Method erasePart
   *
   * @description
   * Erases the 500 deepest tasks of an entry too large for one batch (then by id), read from their
   * stored parent links and locked `FOR UPDATE` by id.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the job.
   * @param {TrashEntryRecord} entry - The entry, locked, of more than 500 tasks.
   * @returns {Promise<number>} The tasks erased.
   * @throws {Error} When the tree holds a cycle, or a task chosen left the entry under its lock:
   * defects.
   */
  private async erasePart(
    store: TasksStore,
    organizationId: string,
    entry: TrashEntryRecord,
  ): Promise<number> {
    const nodes: readonly TrashTreeNode[] = await store.tasks.entryTree(
      organizationId,
      entry.id,
      entry.rootTaskId,
    );
    const deepest: readonly TrashTreeNode[] = [...nodes]
      .sort(
        (left: TrashTreeNode, right: TrashTreeNode): number =>
          right.depth - left.depth || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      )
      .slice(0, MAX_TASKS);
    const locked: readonly Task[] = await store.tasks.lockEntryTasks(
      organizationId,
      entry.id,
      deepest.map((node: TrashTreeNode): string => node.id),
    );
    const byId = new Map<string, Task>(
      locked.map((task: Task): [string, Task] => [task.snapshot.id, task]),
    );
    const tasks: readonly Task[] = deepest.map((node: TrashTreeNode): Task => {
      const task: Task | undefined = byId.get(node.id);
      if (task === undefined) {
        throw new Error(`The task ${node.id} left the trash entry ${entry.id} under its lock.`);
      }
      return task;
    });
    return this.eraser.erasePart(store, organizationId, {
      entry,
      tasks,
      actor: this.actorOf(entry),
    });
  }

  /**
   * Method lockEntries
   *
   * @description
   * Locks the entries handed over, else the entries due.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the job.
   * @returns {Promise<readonly TrashEntryRecord[]>} The entries, oldest first.
   */
  private async lockEntries(
    store: TasksStore,
    organizationId: string,
  ): Promise<readonly TrashEntryRecord[]> {
    const handedOver: readonly TrashEntryRecord[] = await store.trash.lockHandedOver(
      organizationId,
      MAX_ENTRIES,
    );
    if (handedOver.length > 0) {
      return handedOver;
    }
    const now: Date = await store.clock.now();
    return store.trash.lockDue(organizationId, purgeDueBefore(now), MAX_ENTRIES);
  }

  /**
   * Method take
   *
   * @description
   * The entries the batch erases whole: in their order, each of 500 tasks or fewer, while the
   * entries taken hold fewer than 500 tasks (their stored `task_count`); the first entry larger
   * than that stops the batch.
   *
   * @param {readonly TrashEntryRecord[]} entries - The entries locked, the first of 500 tasks or
   * fewer.
   * @returns {readonly TrashEntryRecord[]} The entries taken.
   */
  private take(entries: readonly TrashEntryRecord[]): readonly TrashEntryRecord[] {
    const taken: TrashEntryRecord[] = [];
    let held: number = 0;
    for (const entry of entries) {
      if (held >= MAX_TASKS || entry.taskCount > MAX_TASKS) {
        break;
      }
      taken.push(entry);
      held += entry.taskCount;
    }
    return taken;
  }

  /**
   * Method actorOf
   *
   * @description
   * Who erases an entry (`erasureActorOf`): the requester of "Vider la corbeille" for an entry
   * handed over, task-service for an entry due (`task.purged.v1` of `asyncapi/task-service.yaml`).
   *
   * @param {TrashEntryRecord} entry - The entry.
   * @returns {EventActor} The actor of its erasure.
   */
  private actorOf(entry: TrashEntryRecord): EventActor {
    const by: TaskActor = erasureActorOf(entry.purgeRequest);
    return { type: by.type, id: by.id };
  }
  // #endregion
}
