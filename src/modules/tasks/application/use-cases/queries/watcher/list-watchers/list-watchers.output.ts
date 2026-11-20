/** One page of current effective watchers. */
export interface ListWatchersOutput {
  // #region Properties
  /** Watcher user IDs. */
  readonly userIds: readonly string[];

  /** Last user ID when another page follows. */
  readonly next: string | null;

  /** Number of eligible watchers. */
  readonly total: number;

  /** Whether the caller currently follows. */
  readonly callerFollows: boolean;
  // #endregion
}
