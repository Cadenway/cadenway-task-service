/** Removes intake contacts inside the transaction that physically erases their tasks. */
export interface IntakeContactCleanup {
  // #region Methods
  /** Removes contacts belonging to the locked task identifiers. */
  purge(organizationId: string, taskIds: readonly string[]): Promise<void>;
  // #endregion
}
