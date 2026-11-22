import type { MembershipStamp } from './membership-stamp.model.js';

/** The preflight result for the named accounts of one signed Task request. */
export interface DelegatedMembershipProof {
  // #region Properties
  /** Organization in the request's verified tenant context. */
  readonly organizationId: string;

  /** Source result for each user included in the proof. */
  readonly stamps: ReadonlyMap<string, MembershipStamp | null>;
  // #endregion
}
