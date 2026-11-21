/** The authorized placement and the result of applying the Git status rule. */
export interface ApplyGitTaskStatusOutput {
  // #region Properties
  /** Whether the status changed. */
  readonly disposition: 'applied' | 'no_op';

  /** Task verified under its lock. */
  readonly taskId: string;

  /** List verified under its lock. */
  readonly listId: string;

  /** Space verified under its lock. */
  readonly spaceId: string;
  // #endregion
}
