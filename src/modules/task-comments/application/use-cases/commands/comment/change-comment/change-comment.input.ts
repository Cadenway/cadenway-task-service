import type { CommentMention } from '../../../../../domain/policies/comment/comment-text.policy.js';
import type { CommentReadInput } from '../../../../models/comment/comment-read-input.model.js';

/** Authenticated comment change and its comment-version precondition. */
export interface ChangeCommentInput extends CommentReadInput {
  // #region Properties
  /** Comment ID. */
  readonly commentId: string;

  /** Accepted versions, or null for an unconditional write. */
  readonly expectedVersions: readonly number[] | null;

  /** Replacement Markdown, or null to delete. */
  readonly body: string | null | undefined;

  /** Supplied replacement mention spans. */
  readonly mentions?: readonly CommentMention[];
  // #endregion
}
