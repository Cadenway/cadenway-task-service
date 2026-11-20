/** The authenticated actor and source list to copy. */
export interface CreateListCopyInput {
  // #region Properties
  /** The verified tenant. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly sourceListId: string;
  // #endregion
}
