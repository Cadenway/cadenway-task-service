/** Refusal of a comment creation after task authorization. */
export class CommentWriteRefusal extends Error {
  // #region Properties
  /** Stable reason. */
  public readonly reason:
    | 'task-not-found'
    | 'organization-not-found'
    | 'task-archived'
    | 'role-insufficient'
    | 'comment-not-found'
    | 'author-required'
    | 'version-mismatch'
    | 'recipient-invalid'
    | 'invalid';

  /** Caller role when insufficient. */
  public readonly role: 'view' | 'comment' | 'edit' | null;

  /** Current comment version on a failed precondition. */
  public readonly version: number | null;
  // #endregion

  // #region Constructor
  /** Keeps the refusal and optional role. */
  public constructor(
    reason:
      | 'task-not-found'
      | 'organization-not-found'
      | 'task-archived'
      | 'role-insufficient'
      | 'comment-not-found'
      | 'author-required'
      | 'version-mismatch'
      | 'recipient-invalid'
      | 'invalid',
    role: 'view' | 'comment' | 'edit' | null = null,
    version: number | null = null,
  ) {
    super('The comment write was refused.');
    this.reason = reason;
    this.role = role;
    this.version = version;
  }
  // #endregion
}
