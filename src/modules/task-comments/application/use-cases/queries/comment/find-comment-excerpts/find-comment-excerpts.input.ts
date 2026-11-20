import type { CommentExcerptPair } from '../../../../models/comment/comment-excerpt-pair.model.js';

/** Tenant and authorized task-comment pairs for an excerpt lookup. */
export interface FindCommentExcerptsInput {
  // #region Properties
  /** Organization from the verified request context. */
  readonly organizationId: string;

  /** Pairs whose tasks have been authorized in the same tenant snapshot. */
  readonly pairs: readonly CommentExcerptPair[];
  // #endregion
}
