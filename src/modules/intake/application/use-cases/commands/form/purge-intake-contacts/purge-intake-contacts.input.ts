/** Task IDs already locked by a physical trash erasure. */
export interface PurgeIntakeContactsInput {
  // #region Properties
  /** The verified tenant. */
  readonly organizationId: string;

  /** The tasks physically erased. */
  readonly taskIds: readonly string[];
  // #endregion
}
