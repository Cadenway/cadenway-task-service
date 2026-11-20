/** An invalid comment body or mention span (P3b-2 decisions 2 and 3). */
export class InvalidCommentError extends Error {
  // #region Constructor
  /** Creates a content-free description of the invalid input. */
  public constructor() {
    super('The comment body or mention spans are invalid.');
    this.name = 'InvalidCommentError';
  }
  // #endregion
}
