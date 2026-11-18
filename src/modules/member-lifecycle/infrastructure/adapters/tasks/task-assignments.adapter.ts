import type {
  ScheduleMemberUnassignment,
  ScheduleMemberUnassignmentOutput,
} from '../../../../tasks/public/assignee/schedule-member-unassignment.js';
import type { TaskAssignments } from '../../../application/ports/outbound/tasks/assignee/task-assignments.port.js';

/**
 * Class TasksTaskAssignments
 *
 * @description
 * `TaskAssignments` on the public operation `ScheduleMemberUnassignment` of the tasks module,
 * which joins the tenant transaction of the event.
 */
export class TasksTaskAssignments implements TaskAssignments {
  // #region Properties
  /**
   * Property scheduleMemberUnassignment
   *
   * @description
   * The enqueuing of the unassignment job of a former member.
   *
   * @type {ScheduleMemberUnassignment}
   * @readonly
   */
  private readonly scheduleMemberUnassignment: ScheduleMemberUnassignment;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the tasks module.
   *
   * @param {ScheduleMemberUnassignment} scheduleMemberUnassignment - The enqueuing of the job.
   * @constructor
   */
  public constructor(scheduleMemberUnassignment: ScheduleMemberUnassignment) {
    this.scheduleMemberUnassignment = scheduleMemberUnassignment;
  }
  // #endregion

  // #region Methods
  /**
   * Method scheduleUnassignment
   *
   * @description
   * Runs `ScheduleMemberUnassignment` for the removal.
   *
   * @param {string} organizationId - The organization of the event.
   * @param {string} userId - The account of the member who left.
   * @param {string} memberId - The membership that ended.
   * @param {number} membershipVersion - Its version after the removal.
   * @returns {Promise<boolean>} `true` when a job was enqueued, `false` for a duplicate.
   */
  public async scheduleUnassignment(
    organizationId: string,
    userId: string,
    memberId: string,
    membershipVersion: number,
  ): Promise<boolean> {
    const outcome: ScheduleMemberUnassignmentOutput = await this.scheduleMemberUnassignment.execute(
      {
        organizationId,
        userId,
        memberId,
        membershipVersion,
      },
    );
    return outcome.scheduled;
  }
  // #endregion
}
