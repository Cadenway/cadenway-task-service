import { decodeCursor, encodeCursor, ProblemException } from '@cadenway/nest-common';
import type { CursorPosition } from '@cadenway/nest-common';

import type { PagePosition } from '../../../../application/models/page/page-position.model.js';

/**
 * Constant UUID
 *
 * @description
 * The shape of a row id: the cursor is not signed, so its id is checked before it reaches SQL.
 *
 * @type {RegExp}
 */
const UUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Interface InstantPosition
 *
 * @description
 * Where a page of a collection ordered by an instant and an id starts: the instant of the last row
 * of the previous page and its id.
 */
export interface InstantPosition {
  // #region Properties
  /**
   * Property instant
   *
   * @description
   * The creation or occurrence instant of the row, as stored (milliseconds).
   *
   * @type {Date}
   * @readonly
   */
  readonly instant: Date;

  /**
   * Property id
   *
   * @description
   * The id of the row, which breaks the ties.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;
  // #endregion
}

/**
 * Function isStoredInstant
 *
 * @description
 * Whether the instant of a cursor is one `encodeInstantCursor` can have written: a valid instant in
 * the form `toISOString` gives it, from 1970 to 9999. The cursor is not signed, and PostgreSQL
 * refuses an instant of a year past 9999 that `Date` reads, which would otherwise answer a 500.
 *
 * @param {string} text - The instant the cursor carries.
 * @param {Date} instant - The same instant, read by `Date`.
 * @returns {boolean} Whether the instant can start a page.
 */
export function isStoredInstant(text: string, instant: Date): boolean {
  if (Number.isNaN(instant.getTime())) {
    return false;
  }
  const year: number = instant.getUTCFullYear();
  return year >= 1970 && year <= 9999 && instant.toISOString() === text;
}

/**
 * Function invalidCursor
 *
 * @description
 * The refusal of a cursor that is not one of the collection asked for: `400 request.invalid` with
 * one issue on `cursor` (`invalid_cursor`), which never quotes the cursor.
 *
 * @returns {ProblemException} The problem to throw.
 */
export function invalidCursor(): ProblemException {
  return new ProblemException({
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

/**
 * Function isRowId
 *
 * @description
 * Whether the id of a cursor has the shape of a row id. The cursor is not signed, so the id is
 * checked before it reaches SQL.
 *
 * @param {string} id - The id the cursor carries.
 * @returns {boolean} Whether it is a UUID in either case.
 */
export function isRowId(id: string): boolean {
  return UUID.test(id);
}

/**
 * Function encodeInstantCursor
 *
 * @description
 * Encodes where the next page starts as the opaque cursor of the kit, for the collection the
 * `filters` name.
 *
 * @param {InstantPosition | null} position - Where the next page starts, or `null`.
 * @param {unknown} filters - What defines the collection, fingerprinted into the cursor.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function encodeInstantCursor(
  position: InstantPosition | null,
  filters: unknown,
): string | null {
  return position === null
    ? null
    : encodeCursor({ sort: [position.instant.toISOString()], id: position.id }, filters);
}

/**
 * Function decodeInstantCursor
 *
 * @description
 * Decodes the cursor of a previous page of the collection the `filters` name. A cursor that is not
 * one of this collection answers `400 request.invalid` with one issue on `cursor`
 * (`invalid_cursor`): `decodeCursor` of the kit answers it for a malformed cursor or one issued
 * for other filters, and this function answers the same for a decoded position that does not name
 * an instant and a row id. The id is returned in lower case, as the rows hold it, so a position can be
 * compared with them in memory (the overview of a space pages its lists that way).
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {unknown} filters - What defines the collection.
 * @returns {InstantPosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this collection.
 */
export function decodeInstantCursor(
  cursor: string | undefined,
  filters: unknown,
): InstantPosition | null {
  if (cursor === undefined) {
    return null;
  }
  const position: CursorPosition = decodeCursor(cursor, filters);
  const invalid: ProblemException = invalidCursor();
  const text: unknown = position.sort[0];
  if (position.sort.length !== 1 || typeof text !== 'string') {
    throw invalid;
  }
  const instant: Date = new Date(text);
  if (!isStoredInstant(text, instant) || !isRowId(position.id)) {
    throw invalid;
  }
  return { instant, id: position.id.toLowerCase() };
}

/**
 * Function toCursor
 *
 * @description
 * Encodes where the next page of a collection ordered by creation starts.
 *
 * @param {PagePosition | null} position - Where the next page starts, or `null`.
 * @param {unknown} filters - What defines the collection, fingerprinted into the cursor.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toCursor(position: PagePosition | null, filters: unknown): string | null {
  return encodeInstantCursor(
    position === null ? null : { instant: position.createdAt, id: position.id },
    filters,
  );
}

/**
 * Function toPosition
 *
 * @description
 * Decodes the cursor of a previous page of a collection ordered by creation.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {unknown} filters - What defines the collection.
 * @returns {PagePosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this collection.
 */
export function toPosition(cursor: string | undefined, filters: unknown): PagePosition | null {
  const position: InstantPosition | null = decodeInstantCursor(cursor, filters);
  return position === null ? null : { createdAt: position.instant, id: position.id };
}
