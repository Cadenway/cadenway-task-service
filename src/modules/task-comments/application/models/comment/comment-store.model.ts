import type { CommentRepository } from '../../ports/outbound/persistence/comment/comment-repository.port.js';

/** Transaction-bound comment store. */
export interface CommentStore {
  // #region Properties
  /** Comment repository in the same tenant snapshot. */
  readonly comments: CommentRepository;
  // #endregion
}
