import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { ScheduleMemberUnassignmentInput } from './schedule-member-unassignment.input.js';
import type { ScheduleMemberUnassignmentOutput } from './schedule-member-unassignment.output.js';

/**
 * Class ScheduleMemberUnassignment
 *
 * @description
 * Enqueues the job that removes a member who left the organization from every task they are
 * assigned to (`member.removed.v1`; `openapi/internal/task-service.yaml`, "Members"). It runs in
 * the tenant transaction the deduplicator of the kit opened for the removal, which it joins, so
 * the job exists if and only if the removal of the copy commits. It touches no task: the removal
 * costs the same whatever the number of assignments, and `UnassignRemovedMember` does the work in
 * the job. One job per removal: the same membership at the same version enqueues nothing more, so
 * a redelivered or requeued removal is harmless.
 */
export class ScheduleMemberUnassignment {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: TasksUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Enqueues the unassignment job of the removal.
   *
   * @param {ScheduleMemberUnassignmentInput} input - The removal.
   * @returns {Promise<ScheduleMemberUnassignmentOutput>} Whether a job was enqueued.
   * @throws {Error} When the insert fails: the transaction of the removal rolls back and the kit
   * redelivers the event.
   */
  public async execute(
    input: ScheduleMemberUnassignmentInput,
  ): Promise<ScheduleMemberUnassignmentOutput> {
    return this.unitOfWork.run(
      async (store: TasksStore): Promise<ScheduleMemberUnassignmentOutput> => ({
        scheduled: await store.unassignments.enqueue(
          input.organizationId,
          input.userId,
          input.memberId,
          input.membershipVersion,
        ),
      }),
    );
  }
  // #endregion
}
