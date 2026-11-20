/** The projected identifiers of an eligible current member. */
export interface ListActiveMembersOutput {
  // #region Properties
  /** The human account, which orders the page. */
  readonly userId: string;

  /** The selected active membership in this organization. */
  readonly memberId: string;
  // #endregion
}
