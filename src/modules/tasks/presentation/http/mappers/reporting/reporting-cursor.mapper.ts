import { decodeCursor, encodeCursor } from '@cadenway/nest-common';

import type { ReportingPosition } from '../../../../application/models/reporting/reporting-position.model.js';
import { invalidCursor, isRowId } from '../page/page-cursor.mapper.js';

const TASK_KEY = /^[A-Z]{2,5}-[1-9][0-9]{0,8}$/u;

/** Decodes a page position for this actor, list, window and filters. */
export function reportingPosition(
  cursor: string | undefined,
  scope: unknown,
): ReportingPosition | null {
  if (cursor === undefined) return null;
  const position = decodeCursor(cursor, scope);
  const userId = position.sort[0];
  if (
    position.sort.length !== 1 ||
    (userId !== null && (typeof userId !== 'string' || !isRowId(userId))) ||
    !TASK_KEY.test(position.id)
  ) {
    throw invalidCursor();
  }
  return { userId: userId === null ? null : userId.toLowerCase(), taskKey: position.id };
}

/** Encodes a page position with the same request scope. */
export function reportingCursor(position: ReportingPosition | null, scope: unknown): string | null {
  return position === null
    ? null
    : encodeCursor({ id: position.taskKey, sort: [position.userId] }, scope);
}
