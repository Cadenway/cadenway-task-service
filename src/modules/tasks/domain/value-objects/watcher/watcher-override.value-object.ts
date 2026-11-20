/** One account's explicit subscription override (P3b-2 decision 7). */
export interface WatcherOverride {
  // #region Properties
  /** The account addressed by the override. */
  readonly userId: string;

  /** Whether the account explicitly follows the task. */
  readonly following: boolean;
  // #endregion
}
