import type { CommentExcerptPair } from './comment-excerpt-pair.model.js';

/** A bounded display excerpt for a live comment. */
export interface CommentExcerpt extends CommentExcerptPair {
  // #region Properties
  /** Current plain-text excerpt, limited to 200 Unicode code points. */
  readonly excerpt: string;
  // #endregion
}
