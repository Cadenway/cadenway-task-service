/** The changed account and the task version to return as an ETag. */
export interface SetTaskWatcherOutput {
  // #region Properties
  /** Account whose override was requested. */
  readonly userId: string;

  /** Task version after the override, or the current version for a no-op. */
  readonly version: number;
  // #endregion
}
