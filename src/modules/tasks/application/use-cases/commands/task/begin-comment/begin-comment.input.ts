/** Verified user and task for a comment creation. */
export interface BeginCommentInput {
  // #region Properties
  /** Tenant ID. */
  readonly organizationId: string;

  /** Acting account ID. */
  readonly actorUserId: string;

  /** Task key. */
  readonly taskKey: string;

  /** Mention recipients whose membership must remain stable through the write. */
  readonly recipientIds?: readonly string[];
  // #endregion
}
