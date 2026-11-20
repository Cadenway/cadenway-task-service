import { decodeCursor, encodeCursor, ProblemException } from '@cadenway/nest-common';
import type { CommentPosition } from '../../../../application/models/comment/comment-position.model.js';

/** Encodes an ascending comment position bound to the task key and ordering. */
export function encodeCommentCursor(
  position: CommentPosition | null,
  taskKey: string,
  organizationId: string,
): string | null {
  return position === null
    ? null
    : encodeCursor(
        { sort: [position.createdAt.toISOString()], id: position.id },
        { collection: 'task-comments', taskKey, organizationId },
      );
}

/** Decodes a task-bound cursor and rejects malformed timestamp or UUID values. */
export function decodeCommentCursor(
  cursor: string | undefined,
  taskKey: string,
  organizationId: string,
): CommentPosition | null {
  if (cursor === undefined) return null;
  const value = decodeCursor(cursor, { collection: 'task-comments', taskKey, organizationId });
  const instant: unknown = value.sort[0];
  const date = typeof instant === 'string' ? new Date(instant) : new Date(Number.NaN);
  if (
    value.sort.length !== 1 ||
    typeof instant !== 'string' ||
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() < 1970 ||
    date.getUTCFullYear() > 9999 ||
    date.toISOString() !== instant ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value.id)
  ) {
    throw new ProblemException({
      status: 400,
      code: 'request.invalid',
      detail: 'The request does not match its contract.',
      details: {
        issues: [
          {
            in: 'query',
            path: 'cursor',
            code: 'invalid_cursor',
            message: 'Expected the nextCursor of a previous page of this collection.',
          },
        ],
      },
    });
  }
  return { createdAt: date, id: value.id.toLowerCase() };
}
