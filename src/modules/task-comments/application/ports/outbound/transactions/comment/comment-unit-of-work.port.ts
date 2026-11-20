import type { CommentWriteStore } from '../../../../models/comment/comment-write-store.model.js';
import type { CommentStore } from '../../../../models/comment/comment-store.model.js';

/** Opens or joins a tenant-scoped consistent read snapshot. */
export interface CommentUnitOfWork {
  // #region Methods
  /** Runs the complete read in one tenant snapshot. */
  read<TResult>(work: (store: CommentStore) => Promise<TResult>): Promise<TResult>;

  /** Runs a write in one tenant transaction. */
  write<TResult>(work: (store: CommentWriteStore) => Promise<TResult>): Promise<TResult>;
  // #endregion
}
