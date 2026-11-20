/** Refusal of a comment read, without exposing inaccessible data. */
export class CommentReadRefusal extends Error {
  // #region Properties
  /** Stable application refusal. */
  public readonly reason: 'task-not-found' | 'organization-not-found' | 'comment-not-found';
  // #endregion

  // #region Constructor
  /** Records the refusal without private data. */
  public constructor(reason: 'task-not-found' | 'organization-not-found' | 'comment-not-found') {
    super('The comment read was refused.');
    this.reason = reason;
  }
  // #endregion
}
