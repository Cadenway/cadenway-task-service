import type {
  DropTargetAccessRequests,
  DropTargetAccessRequestsOutput,
} from '../../../../access-requests/public/access-request/drop-target-access-requests.js';
import type { RequestDropTarget } from '../../../application/models/access-request/request-drop-target.model.js';
import type { TargetAccessRequests } from '../../../application/ports/outbound/access-requests/access-request/target-access-requests.port.js';

/**
 * Constant TASKS_PER_CALL
 *
 * @description
 * The most tasks one call of `DropTargetAccessRequests` takes, its bound: a larger set is dropped
 * in chunks of this size, each one statement, all in the transaction of the caller.
 *
 * @type {number}
 */
const TASKS_PER_CALL: number = 2_000;

/**
 * Class AccessRequestsTargetAccessRequests
 *
 * @description
 * `TargetAccessRequests` on the public operation `DropTargetAccessRequests` of the access-requests
 * module, which joins the tenant transaction of the job step that calls it. The tasks of a target
 * are given to it 2,000 at a time, its bound, so the job passes any number of them (an entry holds
 * the archived subtasks of its root, which the product does not limit).
 */
export class AccessRequestsTargetAccessRequests implements TargetAccessRequests {
  // #region Properties
  /**
   * Property dropTargetAccessRequests
   *
   * @description
   * The dropping of the pending requests of a deleted target.
   *
   * @type {DropTargetAccessRequests}
   * @readonly
   */
  private readonly dropTargetAccessRequests: DropTargetAccessRequests;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the access-requests module.
   *
   * @param {DropTargetAccessRequests} dropTargetAccessRequests - The dropping.
   * @constructor
   */
  public constructor(dropTargetAccessRequests: DropTargetAccessRequests) {
    this.dropTargetAccessRequests = dropTargetAccessRequests;
  }
  // #endregion

  // #region Methods
  /**
   * Method dropPending
   *
   * @description
   * Runs `DropTargetAccessRequests` for the target: once for a list or a space, once per chunk of
   * 2,000 tasks for tasks, none for no task.
   *
   * @param {string} organizationId - The organization of the context.
   * @param {RequestDropTarget} target - The deleted target.
   * @returns {Promise<number>} How many requests were deleted.
   */
  public async dropPending(organizationId: string, target: RequestDropTarget): Promise<number> {
    if (target.kind !== 'tasks') {
      return this.drop(organizationId, target);
    }
    let dropped: number = 0;
    for (let start: number = 0; start < target.taskIds.length; start += TASKS_PER_CALL) {
      dropped += await this.drop(organizationId, {
        kind: 'tasks',
        taskIds: target.taskIds.slice(start, start + TASKS_PER_CALL),
      });
    }
    return dropped;
  }

  /**
   * Method drop
   *
   * @description
   * Runs one call of `DropTargetAccessRequests`.
   *
   * @param {string} organizationId - The organization of the context.
   * @param {RequestDropTarget} target - The target, 2,000 tasks at most.
   * @returns {Promise<number>} How many requests were deleted.
   */
  private async drop(organizationId: string, target: RequestDropTarget): Promise<number> {
    const outcome: DropTargetAccessRequestsOutput = await this.dropTargetAccessRequests.execute({
      organizationId,
      target,
    });
    return outcome.dropped;
  }
  // #endregion
}
