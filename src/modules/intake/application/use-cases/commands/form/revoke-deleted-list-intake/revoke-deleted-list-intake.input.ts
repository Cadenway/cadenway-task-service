/** Lists that were just logically deleted in the caller's tenant transaction. */
export interface RevokeDeletedListIntakeInput {
  // #region Properties
  /** The verified tenant. */
  readonly organizationId: string;

  /** The logically deleted lists. */
  readonly listIds: readonly string[];
  // #endregion
}
