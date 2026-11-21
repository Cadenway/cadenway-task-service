/** Verified user and task for a comment creation. */
export interface BeginCommentInput {
  // #region Properties
  /** Tenant ID. */
  readonly organizationId: string;

  /** Acting account ID. */
  readonly actorUserId: string;

  /** Task key. */
  readonly taskKey: string;

  /** Requires current edit access on the active task and list for a delegated comment. */
  readonly requireEdit?: boolean;

  /** Checks whether the human caller can moderate a rule-authored comment. */
  readonly includeModerationAuthority?: boolean;

  /** Mention recipients whose membership must remain stable through the write. */
  readonly recipientIds?: readonly string[];

  /** Includes the effective watcher audience for a creation fact. */
  readonly includeWatcherAudience?: boolean;

  /** Reads a live reply's human author for this task in the caller's transaction. */
  readonly findReplyAuthor?: (taskId: string) => Promise<string | null>;
  // #endregion
}
