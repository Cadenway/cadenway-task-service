import { decodeCursor, encodeCursor } from '@cadenway/nest-common';
import type { CursorPosition } from '@cadenway/nest-common';

import type { LabelPosition } from '../../../../application/models/label/label-position.model.js';
import { invalidCursor } from '../page/page-cursor.mapper.js';

/**
 * Constant MAX_SORT_KEY_LENGTH
 *
 * @description
 * The longest folded name a cursor carries, in characters. A label has 32 code points at most and
 * the folding can expand each of them; the bound keeps a forged cursor within the 2048 characters
 * of the kit.
 *
 * @type {number}
 */
const MAX_SORT_KEY_LENGTH: number = 1024;

/**
 * Constant MAX_LABEL_KEY_LENGTH
 *
 * @description
 * The longest label key a cursor carries, in characters.
 *
 * @type {number}
 */
const MAX_LABEL_KEY_LENGTH: number = 256;

/**
 * Constant LONE_SURROGATE
 *
 * @description
 * A UTF-16 surrogate that does not belong to a pair: no text a label can hold has one.
 *
 * @type {RegExp}
 */
const LONE_SURROGATE: RegExp = /\p{Surrogate}/u;

/**
 * Function labelsFilters
 *
 * @description
 * What defines the collection of the labels, fingerprinted into its cursor: the collection and the
 * search text as sent.
 *
 * @param {string | undefined} search - The `search` parameter.
 * @returns {object} The filters.
 */
function labelsFilters(search: string | undefined): object {
  return { collection: 'labels', search: search ?? null };
}

/**
 * Function isStorableText
 *
 * @description
 * Whether a text can reach a SQL comparison: not longer than a bound, without U+0000 and without a
 * lone surrogate. The cursor is not signed.
 *
 * @param {string} text - The text the cursor carries.
 * @param {number} maxLength - The bound, in characters.
 * @returns {boolean} Whether it can start a page.
 */
function isStorableText(text: string, maxLength: number): boolean {
  return text.length <= maxLength && !text.includes('\u0000') && !LONE_SURROGATE.test(text);
}

/**
 * Function toLabelCursor
 *
 * @description
 * Encodes where the next page of the labels starts as the opaque cursor of the kit: `sort` is
 * `[sortKey]`, the folded name the labels are listed by, and `id` the key of the label.
 *
 * @param {LabelPosition | null} position - Where the next page starts, or `null`.
 * @param {string | undefined} search - The `search` parameter.
 * @returns {string | null} The cursor, or `null` on the last page.
 */
export function toLabelCursor(
  position: LabelPosition | null,
  search: string | undefined,
): string | null {
  return position === null
    ? null
    : encodeCursor({ sort: [position.sortKey], id: position.labelKey }, labelsFilters(search));
}

/**
 * Function toLabelPosition
 *
 * @description
 * Decodes the cursor of a previous page of the labels, with the same search.
 *
 * @param {string | undefined} cursor - The `cursor` query parameter.
 * @param {string | undefined} search - The `search` parameter.
 * @returns {LabelPosition | null} Where the page starts, or `null` for the first page.
 * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
 * collection, or whose values are not texts a label can have.
 */
export function toLabelPosition(
  cursor: string | undefined,
  search: string | undefined,
): LabelPosition | null {
  if (cursor === undefined) {
    return null;
  }
  const position: CursorPosition = decodeCursor(cursor, labelsFilters(search));
  const sortKey: unknown = position.sort[0];
  if (
    position.sort.length !== 1 ||
    typeof sortKey !== 'string' ||
    !isStorableText(sortKey, MAX_SORT_KEY_LENGTH) ||
    position.id.length === 0 ||
    !isStorableText(position.id, MAX_LABEL_KEY_LENGTH)
  ) {
    throw invalidCursor();
  }
  return { sortKey, labelKey: position.id };
}
