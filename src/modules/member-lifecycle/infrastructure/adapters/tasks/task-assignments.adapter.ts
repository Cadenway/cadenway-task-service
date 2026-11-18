import type {
  UnassignRemovedMember,
  UnassignRemovedMemberOutput,
} from '../../../../tasks/public/assignee/unassign-removed-member.js';
import type { TaskUnassignmentBatch } from '../../../application/models/clean-up/task-unassignment-batch.model.js';
import type { TaskAssignments } from '../../../application/ports/outbound/tasks/assignee/task-assignments.port.js';

/**
 * Class TasksTaskAssignments
 *
 * @description
 * `TaskAssignments` on the public operation `UnassignRemovedMember` of the tasks module, which
 * opens one tenant transaction per batch in the organization context of the clean-up job.
 */
export class TasksTaskAssignments implements TaskAssignments {
  // #region Properties
  /**
   * Property unassignRemovedMember
   *
   * @description
   * One batch of the unassignment of a former member.
   *
   * @type {UnassignRemovedMember}
   * @readonly
   */
  private readonly unassignRemovedMember: UnassignRemovedMember;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the tasks module.
   *
   * @param {UnassignRemovedMember} unassignRemovedMember - One batch of the unassignment.
   * @constructor
   */
  public constructor(unassignRemovedMember: UnassignRemovedMember) {
    this.unassignRemovedMember = unassignRemovedMember;
  }
  // #endregion

  // #region Methods
  /**
   * Method unassignBatch
   *
   * @description
   * Runs one batch of `UnassignRemovedMember` for the former member.
   *
   * @param {string} organizationId - The organization of the context.
   * @param {string} userId - The account of the member who left.
   * @param {string | null} afterTaskId - Where the batch starts, `null` for the first.
   * @returns {Promise<TaskUnassignmentBatch>} What the batch did.
   */
  public async unassignBatch(
    organizationId: string,
    userId: string,
    afterTaskId: string | null,
  ): Promise<TaskUnassignmentBatch> {
    const outcome: UnassignRemovedMemberOutput = await this.unassignRemovedMember.execute({
      organizationId,
      userId,
      afterTaskId,
    });
    return outcome.outcome === 'unassigned'
      ? { outcome: 'unassigned', unassigned: outcome.unassigned, lastTaskId: outcome.lastTaskId }
      : outcome;
  }
  // #endregion
}
