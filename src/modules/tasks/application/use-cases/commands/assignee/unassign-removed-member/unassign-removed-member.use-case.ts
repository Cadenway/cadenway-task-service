import { ActivityEntry } from '../../../../../domain/aggregates/activity/activity-entry.aggregate.js';
import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { ActivityEntryDraft } from '../../../../../domain/value-objects/activity/activity-entry-draft.value-object.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import { TASK_SERVICE_ACTOR } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskUpdate } from '../../../../../domain/value-objects/task/task-update.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ActivityRecorder } from '../../../../services/activity/activity-recorder.service.js';
import type { UnassignRemovedMemberInput } from './unassign-removed-member.input.js';
import type { UnassignRemovedMemberOutput } from './unassign-removed-member.output.js';

/**
 * How many tasks one batch locks and rewrites, in one transaction of set-based statements (nine
 * statements with the clock, eight without a parent, plus one outbox append per changed task):
 * 1,200 tasks in three batches finished within 2 seconds in `tests/tasks.int-spec.ts`, far under
 * the 10 s statement timeout of the application role, and a request waits for a task of a batch at
 * most its 5 s lock timeout.
 */
const BATCH_SIZE: number = 500;

/** A task of a batch with what the domain made of it. */
interface Change {
  // #region Properties
  /** The task as it was locked. */
  readonly before: Task;

  /** What the domain made of it. */
  readonly update: TaskUpdate;
  // #endregion
}

/**
 * Class UnassignRemovedMember
 *
 * @description
 * One batch of the removal of a member who left the organization from the tasks they are assigned
 * to, closed ones included (`member.removed.v1`; `openapi/internal/task-service.yaml`, "Members").
 * The clean-up job of member-lifecycle calls it in the organization context of the job, after the
 * removal committed and the private spaces were handed over, batch after batch until it answers
 * `none-left` or `member-again`. Each call is one tenant transaction, after the last task id of
 * the previous batch (a keyset on `task_assignees.task_id`):
 *
 * 1. it locks up to 500 tasks `FOR NO KEY UPDATE` (they come without checklist, which it never
 *    reads);
 * 2. then it reads the copy of the memberships: when it holds the account as a member again (a new
 *    membership joined after the removal), it writes nothing (`member-again`). Reading after the
 *    lock means that an assignment made after the re-join either committed before the lock, and
 *    the copy read after it shows the re-join, or waits for the lock and comes after the batch: a
 *    new assignment is never undone;
 * 3. otherwise it lets the domain remove the account (`Task.unassign`), keeps only the tasks the
 *    domain changed (one that lost the account between the read of its assignee rows and the lock
 *    is already as wanted), writes the batch in set-based statements, records one `assign` entry
 *    (`added: false`) and appends one `task.updated.v1` (`changed: ['assigneeIds']`) per changed
 *    task, all by the system actor `task-service`, and commits.
 *
 * A failed batch rolls back alone: the batches before it stay committed, and a new attempt that
 * starts again from `null` finds only the tasks still assigned, so it never writes a task twice. A
 * batch that finds nothing changes nothing, which makes the job idempotent.
 */
export class UnassignRemovedMember {
  // #region Properties
  /** The tenant transactions of the batches. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The copy of the memberships. */
  private readonly members: MemberDirectory;

  /** Writes the activity entries. */
  private readonly recorder: ActivityRecorder;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the directory of the members.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transactions.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @constructor
   */
  public constructor(unitOfWork: TasksUnitOfWork, members: MemberDirectory) {
    this.unitOfWork = unitOfWork;
    this.members = members;
    this.recorder = new ActivityRecorder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Removes the account from the next batch of its tasks, in one tenant transaction.
   *
   * @param {UnassignRemovedMemberInput} input - The organization, the former member and where the
   * batch starts.
   * @returns {Promise<UnassignRemovedMemberOutput>} What the batch did.
   * @throws {Error} When the batch fails (the database, a lock or statement timeout): it rolls
   * back alone, and the job retries.
   */
  public async execute(input: UnassignRemovedMemberInput): Promise<UnassignRemovedMemberOutput> {
    return this.unitOfWork.run((store: TasksStore): Promise<UnassignRemovedMemberOutput> =>
      this.unassignBatch(store, input),
    );
  }

  /**
   * Method unassignBatch
   *
   * @description
   * Locks the next batch, checks the copy, and unassigns the tasks of the batch that still have
   * the account, in the transaction of `store`.
   *
   * @param {TasksStore} store - The store of the transaction of the batch.
   * @param {UnassignRemovedMemberInput} input - The organization, the former member and where the
   * batch starts.
   * @returns {Promise<UnassignRemovedMemberOutput>} How the batch ended.
   */
  private async unassignBatch(
    store: TasksStore,
    input: UnassignRemovedMemberInput,
  ): Promise<UnassignRemovedMemberOutput> {
    const batch: readonly Task[] = await store.tasks.lockAssignedTo(
      input.organizationId,
      input.userId,
      input.afterTaskId,
      BATCH_SIZE,
    );
    const last: Task | undefined = batch.at(-1);
    if (last === undefined) {
      return { outcome: 'none-left' };
    }
    const role: MemberRole | null = await this.members.roleOf(input.organizationId, input.userId);
    if (role !== null) {
      return { outcome: 'member-again' };
    }
    const now: Date = await store.clock.now();
    const actor: EventActor = { type: 'system', id: TASK_SERVICE_ACTOR.id };
    const changes: readonly Change[] = batch
      .map((task: Task): Change => ({ before: task, update: task.unassign(input.userId, now) }))
      .filter(({ update }: Change): boolean => update.changed.length > 0);
    const entries: ActivityEntryDraft[] = changes.flatMap(
      ({ before, update }: Change): readonly ActivityEntryDraft[] =>
        ActivityEntry.forChange(before.snapshot, update.task.snapshot, TASK_SERVICE_ACTOR, now),
    );
    await store.tasks.unassignBatch(
      input.organizationId,
      input.userId,
      changes.map(({ update }: Change): Task => update.task),
    );
    await this.recorder.record(store.activity, entries);
    for (const { update } of changes) {
      await store.events.taskUpdated(update.task, update.changed, actor);
    }
    return {
      outcome: 'unassigned',
      locked: batch.length,
      unassigned: changes.length,
      lastTaskId: last.snapshot.id,
    };
  }
  // #endregion
}
