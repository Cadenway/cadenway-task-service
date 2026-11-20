/** Direct space roles in the order of their first request occurrence. */
export interface ResolveDocumentSpaceAccessOutput {
  // #region Properties
  /** Authorized spaces with canonical lowercase IDs. */
  readonly results: readonly {
    readonly spaceId: string;
    readonly role: 'view' | 'comment' | 'edit';
  }[];
  // #endregion
}
