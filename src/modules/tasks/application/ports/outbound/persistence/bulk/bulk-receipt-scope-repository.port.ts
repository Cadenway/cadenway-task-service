/** Holds the historical list access proof alongside the kit's idempotent response. */
export interface BulkReceiptScopeRepository {
  // #region Methods
  /** Records historical scope in the transaction writing the receipt. */
  record(organizationId: string, key: string, listIds: readonly string[]): Promise<void>;

  /** Reads proof for the current matching generation of a stored response. */
  find(
    organizationId: string,
    key: string,
    serializedResponse: string,
  ): Promise<readonly string[] | null>;
  // #endregion
}
