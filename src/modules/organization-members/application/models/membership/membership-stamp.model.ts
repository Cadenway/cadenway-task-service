/** Identifies the generation, version and role of a current organization membership. */
export interface MembershipStamp {
  // #region Properties
  /** Membership generation. */
  readonly memberId: string;

  /** Version at which the role was evaluated. */
  readonly version: number;

  /** Role returned by the authority. */
  readonly role: 'owner' | 'admin' | 'member' | 'guest';
  // #endregion
}
