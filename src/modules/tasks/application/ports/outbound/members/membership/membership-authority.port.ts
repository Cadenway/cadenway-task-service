import type { MembershipStamp } from '../../../../models/membership/membership-stamp.model.js';

/** Reads the current active membership from Organization, outside the Task transaction. */
export interface MembershipAuthority {
  // #region Methods
  /** Returns the currently active membership in the named tenant. */
  find(organizationId: string, userId: string): Promise<MembershipStamp | null>;
  // #endregion
}
