import type { AutomationCommentProof } from '../../../../models/comment/automation-comment-proof.model.js';

/** Checks the source membership before applying or replaying a delegated comment. */
export interface AutomationCommentAccess {
  // #region Methods
  /** Reads the author in Organization before opening a Task transaction. */
  read(organizationId: string, userId: string): Promise<AutomationCommentProof>;

  /** Runs the local authorization and protected operation in one transaction. */
  run<TResult>(work: () => Promise<TResult>): Promise<TResult>;
  // #endregion
}
