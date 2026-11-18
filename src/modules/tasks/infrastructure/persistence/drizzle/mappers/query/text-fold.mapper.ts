import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * Constant COMBINING_MARKS
 *
 * @description
 * The bracket expression of the Unicode combining marks the fold removes after the decomposition:
 * the diacritical marks, their extended, supplement and symbol blocks, and the half marks. The
 * escapes are read by PostgreSQL, not by JavaScript.
 *
 * @type {string}
 */
const COMBINING_MARKS: string = String.raw`[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]`;

/**
 * Function foldText
 *
 * @description
 * The expression `F(x)` that compares text "without regard to case or accents"
 * (`openapi/public/tasks.yaml:225-226`): Unicode case folding, compatibility decomposition (NFKD),
 * then the combining marks removed. It uses PostgreSQL 18 core functions only (`casefold`,
 * `normalize` and the built-in collation `pg_unicode_fast`), so it needs no extension, and a UTF8
 * database. It is immutable. Both sides of every comparison use it.
 *
 * @param {AnyPgColumn | SQL | string} value - A column, an expression, or a text bound as a
 * parameter.
 * @returns {SQL} The folded text.
 */
export function foldText(value: AnyPgColumn | SQL | string): SQL {
  return sql`regexp_replace(normalize(casefold((${value})::text collate "pg_unicode_fast"), NFKD), ${sql.raw(`'${COMBINING_MARKS}'`)}, '', 'g')`;
}
