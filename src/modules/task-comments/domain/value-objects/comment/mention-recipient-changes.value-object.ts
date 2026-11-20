/** A change in the unique recipient accounts of structured mention spans. */
export interface MentionRecipientChanges {
  // #region Properties
  /** Recipients newly named. */
  readonly added: readonly string[];

  /** Previously named recipients no longer named. */
  readonly removed: readonly string[];
  // #endregion
}
