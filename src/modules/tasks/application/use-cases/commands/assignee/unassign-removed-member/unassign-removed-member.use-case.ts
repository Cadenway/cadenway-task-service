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

/** How many tasks one batch locks and rewrites in set-based statements. */
const BATCH_SIZE: number = 500;

/**
 * Class UnassignRemovedMember
 *
 * @description
 * Removes a member who left the organization from every task they are assigned to, closed ones
 * included (`member.removed.v1`; `openapi/internal/task-service.yaml`, "Members"). It runs in the
 * tenant transaction the deduplicator of the kit opened for the event, after the copy of the
 * memberships and the hand-over of the private spaces, so that all of them commit together or the
 * event is redelivered. It does nothing while the copy still holds the account as a member under
 * another membership. Otherwise, in batches of 500 tasks after the last id of the previous batch,
 * it locks them `FOR NO KEY UPDATE`, lets the domain remove the account (`Task.unassign`), writes
 * the batch in set-based statements, records one `assign` entry (`added: false`) and appends one
 * `task.updated.v1` (`changed: ['assigneeIds']`) per task, all by the system actor
 * `task-service`. A second removal of the same account finds nothing and is therefore harmless.
 */
export class UnassignRemovedMember {
  // #region Properties
  /** The tenant transaction of the use case. */
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
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
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
   * Removes the account from its tasks.
   *
   * @param {UnassignRemovedMemberInput} input - The organization and the former member.
   * @returns {Promise<UnassignRemovedMemberOutput>} How many tasks were changed.
   * @throws {Error} When a statement fails (the database, a lock or statement timeout): the
   * transaction rolls back and the kit redelivers the event.
   */
  public async execute(input: UnassignRemovedMemberInput): Promise<UnassignRemovedMemberOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<UnassignRemovedMemberOutput> => {
      const role: MemberRole | null = await this.members.roleOf(input.organizationId, input.userId);
      if (role !== null) {
        return { unassigned: 0 };
      }
      const now: Date = await store.clock.now();
      const actor: EventActor = { type: 'system', id: TASK_SERVICE_ACTOR.id };
      let unassigned: number = 0;
      let afterId: string | null = null;
      for (;;) {
        const batch: readonly Task[] = await store.tasks.lockAssignedTo(
          input.organizationId,
          input.userId,
          afterId,
          BATCH_SIZE,
        );
        const last: Task | undefined = batch.at(-1);
        if (last === undefined) {
          return { unassigned };
        }
        const updates: readonly TaskUpdate[] = batch.map((task: Task): TaskUpdate =>
          task.unassign(input.userId, now),
        );
        const entries: ActivityEntryDraft[] = batch.flatMap(
          (task: Task, index: number): readonly ActivityEntryDraft[] =>
            ActivityEntry.forChange(
              task.snapshot,
              updates[index]?.task.snapshot ?? task.snapshot,
              TASK_SERVICE_ACTOR,
              now,
            ),
        );
        await store.tasks.unassignBatch(
          input.organizationId,
          input.userId,
          updates.map((update: TaskUpdate): Task => update.task),
        );
        await this.recorder.record(store.activity, entries);
        for (const update of updates) {
          await store.events.taskUpdated(update.task, update.changed, actor);
        }
        unassigned += batch.length;
        afterId = last.snapshot.id;
        if (batch.length < BATCH_SIZE) {
          return { unassigned };
        }
      }
    });
  }
  // #endregion
}
