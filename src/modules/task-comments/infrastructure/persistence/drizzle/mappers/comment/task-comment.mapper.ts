import { Comment } from '../../../../../domain/aggregates/comment/comment.aggregate.js';
import { InvalidCommentError } from '../../../../../domain/errors/comment/invalid-comment.error.js';
import type { CommentState } from '../../../../../domain/value-objects/comment/comment-state.value-object.js';
import type { taskComments } from '../../schemas/comment/task-comment.schema.js';

/** Maps a database row to a validated comment. */
export function toComment(row: typeof taskComments.$inferSelect): Comment {
  if (
    row.actorType !== 'user' &&
    row.actorType !== 'automation' &&
    row.actorType !== 'git' &&
    row.actorType !== 'system'
  ) {
    throw new InvalidCommentError();
  }
  const state: CommentState = { ...row, actorType: row.actorType };
  return Comment.restore(state);
}
