/** Unique accounts added to or removed from a description's mention set. */
export interface DescriptionMentionChanges {
  // #region Properties
  /** New recipient account IDs, in first-seen order. */
  readonly added: readonly string[];

  /** Removed recipient account IDs, in first-seen order. */
  readonly removed: readonly string[];
  // #endregion
}
