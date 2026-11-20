import { decodeCursor, encodeCursor } from '@cadenway/nest-common';

import type { MilestonePosition } from '../../../../application/models/query/milestone-position.model.js';
import { invalidCursor, isRowId } from '../page/page-cursor.mapper.js';
import { isStoredDate } from '../page/task-position-cursor.mapper.js';

/** Reads a date and ID from a cursor bound to this space and ordering. */
export function decodeMilestoneCursor(
  cursor: string | undefined,
  collection: unknown,
): MilestonePosition | null {
  if (cursor === undefined) return null;
  const position = decodeCursor(cursor, collection);
  const dueDate = position.sort[0];
  if (
    position.sort.length !== 1 ||
    !isRowId(position.id) ||
    (dueDate !== null && (typeof dueDate !== 'string' || !isStoredDate(dueDate)))
  ) {
    throw invalidCursor();
  }
  return { dueDate, id: position.id.toLowerCase() };
}

/** Encodes the stable date and ID of the last returned row. */
export function encodeMilestoneCursor(
  position: MilestonePosition | null,
  collection: unknown,
): string | null {
  return position === null
    ? null
    : encodeCursor({ sort: [position.dueDate], id: position.id }, collection);
}
