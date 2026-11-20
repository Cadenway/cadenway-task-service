import type { Comment } from '../../../../../domain/aggregates/comment/comment.aggregate.js';

/** The changed comment, including a tombstone on deletion. */
export type ChangeCommentOutput = Comment;
