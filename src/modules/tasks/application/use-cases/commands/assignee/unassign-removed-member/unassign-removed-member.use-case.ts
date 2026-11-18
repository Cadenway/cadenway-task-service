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
 * Removes a member who left the organization from every task they are assigned to, closed ones
 * included (`member.removed.v1`; `openapi/internal/task-service.yaml`, "Members"). It runs in the
 * tenant transaction the deduplicator of the kit opened for the event, after the copy of the
 * memberships and the hand-over of the private spaces, so that all of them commit together or the
 * event is redelivered. It does nothing while the copy still holds the account as a member under
 * another membership. Otherwise, in batches of 500 tasks after the last id of the previous batch,
 * it locks them `FOR NO KEY UPDATE` (the tasks come without checklist, which it never reads), lets
 * the domain remove the account (`Task.unassign`), keeps only the tasks the domain changed (one
 * that lost the account between the read of its assignee rows and the lock is already as wanted),
 * writes the batch in set-based statements, records one `assign` entry (`added: false`) and
 * appends one `task.updated.v1` (`changed: ['assigneeIds']`) per changed task, all by the system
 * actor `task-service`. A second removal of the same account finds nothing and is therefore
 * harmless.
 *
 * TODO: unassignment job (PR 2 follow-up change) replaces this inline loop.
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
   * @returns {Promise<UnassignRemovedMemberOutput>} How many tasks were changed; a task that
   * no longer had the account when it was locked is not counted.
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
        unassigned += changes.length;
        afterId = last.snapshot.id;
        if (batch.length < BATCH_SIZE) {
          return { unassigned };
        }
      }
    });
  }
  // #endregion
}
