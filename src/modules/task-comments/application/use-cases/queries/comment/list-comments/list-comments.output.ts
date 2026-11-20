import type { Comment } from '../../../../../domain/aggregates/comment/comment.aggregate.js';
import type { CommentPosition } from '../../../../models/comment/comment-position.model.js';

/** One page and its live total. */
export interface ListCommentsOutput {
  // #region Properties
  /** Live comments in ascending order. */
  readonly items: readonly Comment[];

  /** Position for the next page, or null. */
  readonly next: CommentPosition | null;

  /** Count of all live comments. */
  readonly total: number;
  // #endregion
}
