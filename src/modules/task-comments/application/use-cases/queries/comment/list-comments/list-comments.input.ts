import type { CommentPosition } from '../../../../models/comment/comment-position.model.js';
import type { CommentReadInput } from '../../../../models/comment/comment-read-input.model.js';

/** Scope, cursor position and bound for a comment page. */
export interface ListCommentsInput extends CommentReadInput {
  // #region Properties
  /** Position after the previous page. */
  readonly after: CommentPosition | null;

  /** Requested page size. */
  readonly limit: number;
  // #endregion
}
