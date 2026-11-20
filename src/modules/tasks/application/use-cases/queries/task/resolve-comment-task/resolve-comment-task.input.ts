/** Caller and task key to resolve for a comment read. */
export interface ResolveCommentTaskInput {
  // #region Properties
  /** Verified tenant. */
  readonly organizationId: string;

  /** Verified account. */
  readonly actorUserId: string;

  /** Task key. */
  readonly taskKey: string;

  /** Join an existing write transaction without requesting read-only access. */
  readonly joinWrite?: boolean;
  // #endregion
}
