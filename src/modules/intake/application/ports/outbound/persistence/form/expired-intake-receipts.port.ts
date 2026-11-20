/** Removes a bounded batch of expired intake receipts in its own system transaction. */
export interface ExpiredIntakeReceipts {
  // #region Methods
  /** Deletes at most the given number of available rows and returns the count. */
  deleteBatch(limit: number): Promise<number>;
  // #endregion
}
