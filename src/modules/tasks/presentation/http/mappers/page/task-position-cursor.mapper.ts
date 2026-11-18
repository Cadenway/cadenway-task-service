import { decodeCursor, encodeCursor } from '@cadenway/nest-common';
import type { CursorPosition, CursorValue } from '@cadenway/nest-common';

import { SORT_KEY_PREFIX_LENGTH } from '../../../../application/models/query/sort-key-prefix-length.model.js';
import type { TaskPosition } from '../../../../application/models/query/task-position.model.js';
import { invalidCursor, isRowId, isStoredInstant } from './page-cursor.mapper.js';

/**
 * Type TaskSortKind
 *
 * @description
 * What the sort value of a cursor of tasks is, which decides the shape of its `sort` array:
 * `created` carries the creation instant only (`[createdAt]`), the others carry their sort value
 * first (`[dueDate | null, createdAt]`, `[rank, createdAt]`, `[prefix, createdAt]`).
 */
export type TaskSortKind = 'created' | 'due' | 'priority' | 'name';

/**
 * Constant CALENDAR_DATE
 *
 * @description
 * A calendar date as the contract writes it, `YYYY-MM-DD`, with its parts captured.
 *
 * @type {RegExp}
 */
const CALENDAR_DATE: RegExp = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * Constant LONE_SURROGATE
 *
 * @description
 * A UTF-16 surrogate that does not belong to a pair: no text a task can hold has one.
 *
 * @type {RegExp}
 */
const LONE_SURROGATE: RegExp = /\p{Surrogate}/u;

/**
 * Function isStoredDate
 *
 * @description
 * Whether a text is a calendar date PostgreSQL stores in a `date` column: the form `YYYY-MM-DD`, a
 * year from 0001 to 9999 and a day that exists in its month (the cursor is not signed, and
 * PostgreSQL refuses `2026-02-30` and the year 0000, which would otherwise answer a 500).
 *
 * @param {string} text - The text.
 * @returns {boolean} Whether it is a storable date.
 */
function isStoredDate(text: string): boolean {
  const parts: RegExpExecArray | null = CALENDAR_DATE.exec(text);
  if (parts === null) {
    return false;
  }
  const year: number = Number(parts[1]);
  const month: number = Number(parts[2]);
  const day: number = Number(parts[3]);
  if (year < 1) {
    return false;
  }
  const date: Date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Function isSortValue
 *
 * @description
 * Whether the sort value a cursor carries is one `encodeTaskPosition` can have written for a kind:
 * a storable date or `null` (undated) for `due`, a rank from 1 to 4 for `priority`, a text of at
 * most 128 code points, without U+0000 or a lone surrogate, for `name`.
 *
 * @param {TaskSortKind} kind - What the cursor is sorted by.
 * @param {CursorValue | undefined} value - The value.
 * @returns {boolean} Whether it can start a page.
 */
function isSortValue(kind: TaskSortKind, value: CursorValue | undefined): boolean {
  switch (kind) {
    case 'due':
      return value === null || (typeof value === 'string' && isStoredDate(value));
    case 'priority':
      return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4;
    case 'name':
      return (
        typeof value === 'string' &&
        !value.includes('\u0000') &&
        !LONE_SURROGATE.test(value) &&
        Array.from(value).length <= SORT_KEY_PREFIX_LENGTH
      );
    case 'created':
      return false;
  }
}

/**
 * Function encodeTaskPosition
 *
 * @description
 * Encodes where the next page of tasks starts as the opaque cursor of the kit, for the collection
 * the `filters` name: the sort value of the last task (none for `created`), then its creation
 * instant as `toISOString` writes it, with its id.
 *
 * @param {TaskPosition | null} position - Where the next page starts, or `null`.
 * @param {TaskSortKind} kind - What the page is sorted by.
 * @param {unknown} filters - What defines the collection, fingerprinted into the cursor.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function encodeTaskPosition(
  position: TaskPosition | null,
  kind: TaskSortKind,
  filters: unknown,
): string | null {
  if (position === null) {
    return null;
  }
  const createdAt: string = position.createdAt.toISOString();
  return encodeCursor(
    { sort: kind === 'created' ? [createdAt] : [position.sortValue, createdAt], id: position.id },
    filters,
  );
}

/**
 * Function decodeTaskPosition
 *
 * @description
 * Decodes the cursor of a previous page of tasks of the collection the `filters` name. A cursor
 * that is not one of this collection answers `400 request.invalid` with one issue on `cursor`
 * (`invalid_cursor`): `decodeCursor` of the kit answers it for a malformed cursor, one that is too
 * long or one issued for other filters, and this function answers the same for a decoded position
 * whose `sort` does not have the shape of the kind (date of the year 0000 or that does not exist,
 * rank outside 1 to 4, prefix over 128 code points, an instant that is not stored) or whose id is
 * not a row id.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {TaskSortKind} kind - What the page is sorted by.
 * @param {unknown} filters - What defines the collection.
 * @returns {TaskPosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this collection.
 */
export function decodeTaskPosition(
  cursor: string | undefined,
  kind: TaskSortKind,
  filters: unknown,
): TaskPosition | null {
  if (cursor === undefined) {
    return null;
  }
  const position: CursorPosition = decodeCursor(cursor, filters);
  const hasValue: boolean = kind !== 'created';
  if (position.sort.length !== (hasValue ? 2 : 1) || !isRowId(position.id)) {
    throw invalidCursor();
  }
  const sortValue: CursorValue | undefined = hasValue ? position.sort[0] : null;
  const text: CursorValue | undefined = position.sort[hasValue ? 1 : 0];
  if (
    typeof text !== 'string' ||
    (hasValue && !isSortValue(kind, sortValue)) ||
    sortValue === undefined ||
    typeof sortValue === 'boolean'
  ) {
    throw invalidCursor();
  }
  const createdAt: Date = new Date(text);
  if (!isStoredInstant(text, createdAt)) {
    throw invalidCursor();
  }
  return { sortValue, createdAt, id: position.id };
}
