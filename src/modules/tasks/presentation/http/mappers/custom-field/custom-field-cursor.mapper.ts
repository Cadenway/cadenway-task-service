import { decodeCursor, encodeCursor } from '@cadenway/nest-common';
import type { CustomFieldPosition } from '../../../../application/models/custom-field/custom-field-position.model.js';
import { invalidCursor, isRowId } from '../page/page-cursor.mapper.js';

/** Decodes a position bound to the organization and requested list or space. */
export function decodeCustomFieldCursor(
  cursor: string | undefined,
  collection: unknown,
): CustomFieldPosition | null {
  if (cursor === undefined) return null;
  const position = decodeCursor(cursor, collection);
  const order = position.sort[0];
  if (
    position.sort.length !== 1 ||
    typeof order !== 'number' ||
    !Number.isInteger(order) ||
    order < 0 ||
    order > 29 ||
    !isRowId(position.id)
  ) {
    throw invalidCursor();
  }
  return { position: order, id: position.id.toLowerCase() };
}

/** Encodes the last returned definition. */
export function encodeCustomFieldCursor(
  position: CustomFieldPosition | null,
  collection: unknown,
): string | null {
  return position === null
    ? null
    : encodeCursor({ sort: [position.position], id: position.id }, collection);
}
