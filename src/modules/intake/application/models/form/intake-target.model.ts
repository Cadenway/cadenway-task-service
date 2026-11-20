/** The tenant and list found by a narrowly scoped public-key lookup. */
export interface IntakeTarget {
  // #region Properties
  /** Provides organizationId. */
  readonly organizationId: string;

  /** Provides listId. */
  readonly listId: string;
  // #endregion
}
