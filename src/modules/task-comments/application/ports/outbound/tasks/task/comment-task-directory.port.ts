import type { CommentReadInput } from '../../../../models/comment/comment-read-input.model.js';
import type { CommentTaskResult } from '../../../../models/comment/comment-task-result.model.js';

/** Resolves the task only after checking the caller's visibility. */
export interface CommentTaskDirectory {
  // #region Methods
  /** Resolves a task within the current tenant transaction. */
  resolve(input: CommentReadInput): Promise<CommentTaskResult>;
  // #endregion
}
