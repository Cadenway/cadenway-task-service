/** Identity, role and version of the same membership row. */
export interface SearchAccessMembership {
  // #region Properties
  /** Identifier of the membership issued by Organization. */
  readonly memberId: string;

  /** Current membership role. */
  readonly role: 'owner' | 'admin' | 'member' | 'guest';

  /** Latest applied version of this membership. */
  readonly version: number;
  // #endregion
}
