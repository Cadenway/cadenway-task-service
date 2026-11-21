import type { CommentReadInput } from '../../../../models/comment/comment-read-input.model.js';
import type { CommentWriteTask } from '../../../../models/comment/comment-write-task.model.js';

/** Task-owned authorization, version and activity operations. */
export interface CommentTaskWriter {
  // #region Methods
  /** Checks current authority for a delegated comment without advancing the task version. */
  authorizeAutomation(input: CommentReadInput): Promise<boolean>;

  /** Checks a human commenter's current authority without changing the task. */
  authorizeUser(
    input: CommentReadInput,
  ): Promise<Exclude<CommentWriteTask, { outcome: 'ready' }> | { readonly outcome: 'authorized' }>;

  /** Authorizes and locks the task, then advances its version in the current transaction. */
  begin(
    input: CommentReadInput & {
      readonly requireEdit?: boolean;
      readonly includeModerationAuthority?: boolean;
    },
    recipientIds?: readonly string[],
    includeWatcherAudience?: boolean,
    findReplyAuthor?: (taskId: string) => Promise<string | null>,
  ): Promise<CommentWriteTask>;

  /** Records the creation activity while the task lock remains held. */
  record(
    input: CommentReadInput & {
      readonly actor?: { readonly type: 'automation'; readonly id: string };
    },
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

  /** Checks a held mention recipient's visibility without acquiring new locks. */
  canRead(input: CommentReadInput, userId: string): Promise<boolean>;
  // #endregion
}
