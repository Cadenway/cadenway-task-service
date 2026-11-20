/** The authenticated actor, task, subject and requested watcher override. */
export interface SetTaskWatcherInput {
  // #region Properties
  /** Verified organization of the request. */
  readonly organizationId: string;

  /** Account making the request. */
  readonly actorUserId: string;

  /** Stable key of the task. */
  readonly taskKey: string;

  /** Account whose override changes. */
  readonly userId: string;

  /** Whether the account explicitly follows the task. */
  readonly following: boolean;

  /** Accepted task versions, or null without a specific version condition. */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
