/** The source's relationships changed before duplication could hold their rows. */
export class TaskCopySourceChanged extends Error {
  // #region Constructor
  /** Identifies a retryable change in the source lock set. */
  public constructor() {
    super('Task copy source changed during locking.');
  }
  // #endregion
}
