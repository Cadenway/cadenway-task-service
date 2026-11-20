import type { CommentCreated } from '../../../../models/comment/comment-created.model.js';

/** Comment events appended in the caller's transaction. */
export interface CommentEvents {
  // #region Methods
  /** Appends the comment-created fact. */
  created(event: CommentCreated): Promise<void>;

  /** Appends the comment-updated fact. */
  updated(event: CommentCreated): Promise<void>;

  /** Appends the comment-deleted fact. */
  deleted(event: CommentCreated): Promise<void>;
  // #endregion
}
