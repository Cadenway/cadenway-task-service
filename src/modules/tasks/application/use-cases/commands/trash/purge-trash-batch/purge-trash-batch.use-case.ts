import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { erasureActorOf } from '../../../../../domain/policies/trash/trash-entry.policy.js';
import { purgeDueBefore } from '../../../../../domain/policies/trash/trash-retention.policy.js';
import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TrashEntryErasure } from '../../../../models/trash/trash-entry-erasure.model.js';
import type { TrashEntryRecord } from '../../../../models/trash/trash-entry-record.model.js';
import type { TrashErasureCounts } from '../../../../models/trash/trash-erasure-counts.model.js';
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
 * A batch stops taking entries once they hold this many tasks or more (the first entry is always
 * taken), counted from the `task_count` of the entries: with 651 live tasks at most per entry, a
 * batch erases 1,150 live tasks at most (499 + 651), plus the archived subtasks under them, which
 * the product does not limit.
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
 * so two jobs of one organization share them; takes them in that order until their `task_count`
 * reaches 500 tasks or more (the entries locked and not taken wait for the next batch); then
 * locks the tasks of all the entries taken `FOR UPDATE` in one statement ordered by id
 * (`trash_entry_id = any($entries)`, `lockTrashEntries`). The eraser emits one `task.purged.v1`
 * per task, with the requester of "Vider la corbeille" for an entry handed over and
 * `{ type: 'system', id: 'task-service' }` for an entry due (`erasureActorOf`), erases them, and
 * erases the deleted lists and spaces they leave without a task. A failed batch rolls back alone.
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
   * @throws {Error} When an entry has no root, a defect, which rolls the batch back.
   */
  public async execute(input: PurgeTrashBatchInput): Promise<PurgeTrashBatchOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<PurgeTrashBatchOutput> => {
      const { organizationId } = input;
      const entries: readonly TrashEntryRecord[] = await this.lockEntries(store, organizationId);
      if (entries.length === 0) {
        return { outcome: 'none-left' };
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
   * The entries the batch erases: in their order, the first always, then each next one while the
   * entries taken hold fewer than 500 tasks (their stored `task_count`).
   *
   * @param {readonly TrashEntryRecord[]} entries - The entries locked.
   * @returns {readonly TrashEntryRecord[]} The entries taken.
   */
  private take(entries: readonly TrashEntryRecord[]): readonly TrashEntryRecord[] {
    const taken: TrashEntryRecord[] = [];
    let held: number = 0;
    for (const entry of entries) {
      if (held >= MAX_TASKS) {
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
