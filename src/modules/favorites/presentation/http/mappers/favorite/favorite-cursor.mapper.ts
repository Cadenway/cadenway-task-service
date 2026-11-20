import { decodeCursor, encodeCursor, ProblemException } from '@cadenway/nest-common';

import type { FavoriteOwner } from '../../../../application/models/collection/favorite-owner.model.js';
import type { FavoritePosition } from '../../../../application/models/collection/favorite-position.model.js';

/** Matches the canonical UUID carried in a cursor issued by this collection. */
const CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** Binds a cursor to this collection and actor, including tenant. */
function cursorScope(owner: FavoriteOwner): readonly string[] {
  return ['favorites', owner.organizationId, owner.actorUserId];
}

/** Encodes the last returned visible entry as the next page boundary. */
export function toFavoriteCursor(
  owner: FavoriteOwner,
  position: FavoritePosition | null,
): string | null {
  return position === null
    ? null
    : encodeCursor(
        { sort: [position.createdAt.toISOString()], id: position.id },
        cursorScope(owner),
      );
}

/** Validates the cursor and its exact timestamp and UUID before the boundary reaches SQL. */
export function toFavoritePosition(
  owner: FavoriteOwner,
  cursor: string | undefined,
): FavoritePosition | null {
  if (cursor === undefined) {
    return null;
  }
  const position = decodeCursor(cursor, cursorScope(owner));
  const instant = position.sort[0];
  if (position.sort.length === 1 && typeof instant === 'string' && CURSOR_ID.test(position.id)) {
    const createdAt = new Date(instant);
    const year = createdAt.getUTCFullYear();
    if (year >= 1970 && year <= 9999 && createdAt.toISOString() === instant) {
      return { createdAt, id: position.id };
    }
  }
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
          message: 'Expected the nextCursor of a previous page of your favorites.',
        },
      ],
    },
  });
}
