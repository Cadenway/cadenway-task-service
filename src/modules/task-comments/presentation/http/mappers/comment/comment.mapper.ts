import type { Comment as CommentBody } from '@cadenway/contracts/types/internal/task-service';
import type { GetCommentOutput } from '../../../../application/use-cases/queries/comment/get-comment/get-comment.output.js';

/** Maps a live stored comment to the installed response contract. */
export function toCommentBody(comment: GetCommentOutput, taskKey: string): CommentBody {
  const state = comment.snapshot;
  if (state.body === null) throw new Error('A tombstone cannot be returned as a comment.');
  return {
    id: state.id,
    taskKey,
    actor: { type: state.actorType, id: state.actorId },
    body: state.body,
    createdAt: state.createdAt.toISOString(),
    editedAt: state.editedAt?.toISOString() ?? null,
    version: state.version,
    mentions: [...state.mentions],
    replyToCommentId: state.replyToCommentId,
  };
}
