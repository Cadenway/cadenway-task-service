import type { CommentReadInput } from '../../../../models/comment/comment-read-input.model.js';
import type { CommentWriteTask } from '../../../../models/comment/comment-write-task.model.js';

/** Task-owned authorization, version and activity operations. */
export interface CommentTaskWriter {
  // #region Methods
  /** Authorizes and locks the task, then advances its version in the current transaction. */
  begin(input: CommentReadInput, recipientIds?: readonly string[]): Promise<CommentWriteTask>;

  /** Records the creation activity while the task lock remains held. */
  record(
    input: CommentReadInput,
    taskVersion: number,
    commentId: string,
    excerpt: string,
  ): Promise<void>;

  /** Updates or removes the existing comment activity. */
  change(
    input: CommentReadInput,
    taskVersion: number,
    commentId: string,
    excerpt: string | null,
  ): Promise<void>;

  /** Checks the reply author's current task visibility without acquiring new locks. */
  canRead(input: CommentReadInput, userId: string): Promise<boolean>;
  // #endregion
}
