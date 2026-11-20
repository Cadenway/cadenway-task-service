/** Accounts whose active memberships are needed in the caller's tenant transaction. */
export interface FindOrganizationMemberRolesInput {
  // #region Properties
  /** The verified tenant. */
  readonly organizationId: string;
  readonly userIds: readonly string[];
  readonly lock: boolean;
  // #endregion
}
