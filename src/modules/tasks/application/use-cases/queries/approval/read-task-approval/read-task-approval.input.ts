/** The verified caller and task of an approval read. */
export interface ReadTaskApprovalInput {
  // #region Properties
  /** The tenant, acting member and task key. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly taskKey: string;
  // #endregion
}
