import type { CommentMention } from '../../../../../domain/policies/comment/comment-text.policy.js';
import type { CommentReadInput } from '../../../../models/comment/comment-read-input.model.js';

/** Comment creation by an authenticated user. */
export interface CreateCommentInput extends CommentReadInput {
  // #region Properties
  /** Submitted Markdown. */
  readonly body: string;

  /** Optional live reply target. */
  readonly replyToCommentId: string | null;

  /** Supplied replacement mention spans. */
  readonly mentions?: readonly CommentMention[];
  // #endregion
}
