import type {
  UnassignRemovedMember,
  UnassignRemovedMemberOutput,
} from '../../../../tasks/public/assignee/unassign-removed-member.js';
import type { RemoveMemberWatcherOverrides } from '../../../../tasks/public/watcher/remove-member-watcher-overrides.js';
import type { TaskUnassignmentBatch } from '../../../application/models/clean-up/task-unassignment-batch.model.js';
import type { WatcherOverrideRemovalBatch } from '../../../application/models/clean-up/watcher-override-removal-batch.model.js';
import type { TaskAssignments } from '../../../application/ports/outbound/tasks/assignee/task-assignments.port.js';

/**
 * Class TasksTaskAssignments
 *
 * @description
 * `TaskAssignments` on the public assignment and watcher cleanup operations of tasks, which
 * open one tenant transaction per batch in the organization context of the job.
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

  /** One batch of the removal of a former member's explicit watcher overrides. */
  private readonly removeMemberWatcherOverrides: RemoveMemberWatcherOverrides;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operations of the tasks module.
   *
   * @param {UnassignRemovedMember} unassignRemovedMember - One batch of the unassignment.
   * @param {RemoveMemberWatcherOverrides} removeMemberWatcherOverrides - One watcher batch.
   * @constructor
   */
  public constructor(
    unassignRemovedMember: UnassignRemovedMember,
    removeMemberWatcherOverrides: RemoveMemberWatcherOverrides,
  ) {
    this.unassignRemovedMember = unassignRemovedMember;
    this.removeMemberWatcherOverrides = removeMemberWatcherOverrides;
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

  /** Runs one watcher cleanup batch for this former member. */
  public async clearWatcherOverridesBatch(
    organizationId: string,
    userId: string,
    afterTaskId: string | null,
  ): Promise<WatcherOverrideRemovalBatch> {
    return this.removeMemberWatcherOverrides.execute({ organizationId, userId, afterTaskId });
  }
  // #endregion
}
