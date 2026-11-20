import type { CommentExcerptPair } from '../../../../models/comment/comment-excerpt-pair.model.js';
import type { CommentExcerptRecord } from '../../../../models/comment/comment-excerpt-record.model.js';

/** Reads live comments in the caller's tenant snapshot. */
export interface CommentExcerptReader {
  // #region Methods
  /** Reads only exact task and comment pairs in the specified organization. */
  findLive(
    organizationId: string,
    pairs: readonly CommentExcerptPair[],
  ): Promise<readonly CommentExcerptRecord[]>;
  // #endregion
}
