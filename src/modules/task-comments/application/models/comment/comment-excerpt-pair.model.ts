/** A comment bound to a task already authorized by the caller. */
export interface CommentExcerptPair {
  // #region Properties
  /** Resolved task UUID. */
  readonly taskId: string;

  /** Comment UUID on that task. */
  readonly commentId: string;
  // #endregion
}
