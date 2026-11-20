import type { CommentStore } from './comment-store.model.js';
import type { CommentEvents } from '../../ports/outbound/messaging/comment/comment-events.port.js';

/** Transaction-bound comment write store. */
export interface CommentWriteStore extends CommentStore {
  // #region Properties
  /** Outbox bound to the same transaction. */
  readonly events: CommentEvents;
  // #endregion
}
