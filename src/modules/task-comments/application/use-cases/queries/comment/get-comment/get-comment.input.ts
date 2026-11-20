import type { CommentReadInput } from '../../../../models/comment/comment-read-input.model.js';

/** Scope and comment identity for a single read. */
export interface GetCommentInput extends CommentReadInput {
  // #region Properties
  /** Comment UUID. */
  readonly commentId: string;
  // #endregion
}
