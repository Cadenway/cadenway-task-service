import { decodeCursor, encodeCursor } from '@cadenway/nest-common';

import { invalidCursor, isRowId } from '../page/page-cursor.mapper.js';

/** Binds a participant cursor to one tenant and task, ordered by user ID. */
export function encodeParticipantCursor(
  userId: string | null,
  target: { readonly organizationId: string; readonly taskKey: string },
): string | null {
  if (userId === null) return null;
  return encodeCursor(
    { id: userId, sort: [userId] },
    { collection: 'task-participants', ...target },
  );
}

/** Rejects a cursor issued for another task, organization or ordering. */
export function decodeParticipantCursor(
  cursor: string | undefined,
  target: { readonly organizationId: string; readonly taskKey: string },
): string | null {
  if (cursor === undefined) return null;
  const position = decodeCursor(cursor, { collection: 'task-participants', ...target });
  if (!isRowId(position.id) || position.sort.length !== 1 || position.sort[0] !== position.id) {
    throw invalidCursor();
  }
  return position.id.toLowerCase();
}
