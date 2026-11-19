import type { DroppedRequestTarget } from '../../../../models/access-request/dropped-request-target.model.js';

/**
 * Interface DropTargetAccessRequestsInput
 *
 * @description
 * The deleted target whose pending access requests the deletion jobs drop.
 */
export interface DropTargetAccessRequestsInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the job context, the one of the tenant transaction, in lower case.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property target
   *
   * @description
   * The tasks moved to the trash (2,000 at most), the deleted list or the deleted space.
   *
   * @type {DroppedRequestTarget}
   * @readonly
   */
  readonly target: DroppedRequestTarget;
  // #endregion
}
