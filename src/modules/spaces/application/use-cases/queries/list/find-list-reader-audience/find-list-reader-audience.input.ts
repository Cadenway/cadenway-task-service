/** Identifies the tenant list whose readers a caller has been authorized to list. */
export interface FindListReaderAudienceInput {
  // #region Properties
  /** The organization from the caller's verified context. */
  readonly organizationId: string;

  /** The list containing the task. */
  readonly listId: string;
  // #endregion
}
