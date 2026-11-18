import type {
  UnassignRemovedMember,
  UnassignRemovedMemberOutput,
} from '../../../../tasks/public/assignee/unassign-removed-member.js';
import type { TaskAssignments } from '../../../application/ports/outbound/tasks/assignee/task-assignments.port.js';

/**
 * Class TasksTaskAssignments
 *
 * @description
 * `TaskAssignments` on the public operation `UnassignRemovedMember` of the tasks module, which
 * joins the tenant transaction of the event.
 */
export class TasksTaskAssignments implements TaskAssignments {
  // #region Properties
  /**
   * Property unassignRemovedMemberOperation
   *
   * @description
   * The removal of a former member from the assignees of every task.
   *
   * @type {UnassignRemovedMember}
   * @readonly
   */
  private readonly unassignRemovedMemberOperation: UnassignRemovedMember;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the tasks module.
   *
   * @param {UnassignRemovedMember} unassignRemovedMember - The unassignment of a former member.
   * @constructor
   */
  public constructor(unassignRemovedMember: UnassignRemovedMember) {
    this.unassignRemovedMemberOperation = unassignRemovedMember;
  }
  // #endregion

  // #region Methods
  /**
   * Method unassignRemovedMember
   *
   * @description
   * Runs `UnassignRemovedMember` for the member who left.
   *
   * @param {string} organizationId - The organization of the event.
   * @param {string} userId - The account of the member who left.
   * @returns {Promise<number>} How many tasks the account was removed from.
   */
  public async unassignRemovedMember(organizationId: string, userId: string): Promise<number> {
    const outcome: UnassignRemovedMemberOutput = await this.unassignRemovedMemberOperation.execute({
      organizationId,
      userId,
    });
    return outcome.unassigned;
  }
  // #endregion
}
