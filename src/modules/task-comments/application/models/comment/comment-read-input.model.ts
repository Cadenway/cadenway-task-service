/** A verified tenant, actor and task key for a comment read. */
export interface CommentReadInput {
  // #region Properties
  /** Organization from the request context. */
  readonly organizationId: string;

  /** User from the request context. */
  readonly actorUserId: string;

  /** Task key from the path. */
  readonly taskKey: string;
  // #endregion
}
