/** A membership generation and the exact role version evaluated by Organization. */
export interface MembershipStamp {
  // #region Properties
  /** Changes on rejoining an organization. */
  readonly memberId: string;

  /** Current role at the source or in the projection. */
  readonly role: 'owner' | 'admin' | 'member' | 'guest';

  /** Version of that membership. */
  readonly version: number;
  // #endregion
}
