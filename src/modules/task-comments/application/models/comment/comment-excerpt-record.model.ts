import type { CommentExcerptPair } from './comment-excerpt-pair.model.js';

/** A live comment body read under its exact task binding. */
export interface CommentExcerptRecord extends CommentExcerptPair {
  // #region Properties
  /** Current Markdown body. */
  readonly body: string;
  // #endregion
}
