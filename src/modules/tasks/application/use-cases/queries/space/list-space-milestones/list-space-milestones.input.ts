import type { MilestonePosition } from '../../../../models/query/milestone-position.model.js';

/** A verified caller, a space and the requested milestone page. */
export interface ListSpaceMilestonesInput {
  // #region Properties
  /** Organization from the verified request context. */
  readonly organizationId: string;

  /** Account from the verified request context. */
  readonly actorUserId: string;

  /** Space to browse. */
  readonly spaceId: string;

  /** Last milestone on the preceding page, if any. */
  readonly after: MilestonePosition | null;

  /** Maximum number of returned items. */
  readonly limit: number;
  // #endregion
}
