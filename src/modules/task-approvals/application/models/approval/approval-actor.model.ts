/** Verified organization, actor and target task supplied by the HTTP adapter. */
export interface ApprovalActor {
  // #region Properties
  /** Members of this contract. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly taskKey: string;
  // #endregion
}
