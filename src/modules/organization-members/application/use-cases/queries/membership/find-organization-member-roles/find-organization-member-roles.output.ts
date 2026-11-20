/** The least privileged active role for a requested account, when one is known. */
export interface FindOrganizationMemberRolesOutput {
  // #region Properties
  /** The requested account. */
  readonly userId: string;
  readonly role: 'owner' | 'admin' | 'member' | 'guest' | null;
  // #endregion
}
