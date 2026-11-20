/** A physically erased list in the caller's tenant transaction. */
export interface PurgeDeletedListIntakeInput {
  // #region Properties
  /** The verified tenant. */
  readonly organizationId: string;

  /** The erased list. */
  readonly listId: string;
  // #endregion
}
