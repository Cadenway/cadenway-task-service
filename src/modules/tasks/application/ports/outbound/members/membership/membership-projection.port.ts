import type { MembershipStamp } from '../../../../models/membership/membership-stamp.model.js';

/** Reads the unique active membership in the transaction that will use it. */
export interface MembershipProjection {
  // #region Methods
  /** Reads a membership stamp, or null if it is missing or ambiguous. */
  stampOf(organizationId: string, userId: string, lock: boolean): Promise<MembershipStamp | null>;
  // #endregion
}
