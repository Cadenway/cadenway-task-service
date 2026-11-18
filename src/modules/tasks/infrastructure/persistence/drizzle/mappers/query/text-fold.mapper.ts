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
 * Constant LETTERS_WITHOUT_DECOMPOSITION
 *
 * @description
 * The letters NFKD leaves whole, folded to one plain letter by `translate`: the stroked and barred
 * letters `ø ł đ ð ħ ŧ` and the dotless `ı`, in lower case (the upper-case forms are lower-cased by
 * `casefold` first). `translate` maps one character to one character, so the ligatures that become
 * two letters (`œ`, `æ`) are replaced separately, by `LIGATURES`.
 *
 * @type {{ readonly from: string; readonly to: string }}
 */
const LETTERS_WITHOUT_DECOMPOSITION: { readonly from: string; readonly to: string } = {
  from: 'øłđðħŧı',
  to: 'olddhti',
};

/**
 * Constant LIGATURES
 *
 * @description
 * The ligatures NFKD leaves whole, replaced by their two letters, in lower case.
 *
 * @type {readonly (readonly [string, string])[]}
 */
const LIGATURES: readonly (readonly [string, string])[] = [
  ['œ', 'oe'],
  ['æ', 'ae'],
];

/**
 * Constant LETTERS_TO_REPLACE
 *
 * @description
 * The bracket expression of the letters `LIGATURES` and `LETTERS_WITHOUT_DECOMPOSITION` replace,
 * in both cases: a text with none of them skips the replacement.
 *
 * @type {string}
 */
const LETTERS_TO_REPLACE: string = '[œæøłđðħŧıŒÆØŁĐÐĦŦ]';

/**
 * Function withPlainLetters
 *
 * @description
 * Replaces the ligatures and the letters NFKD leaves whole by their plain letters, in a text that
 * is already case-folded.
 *
 * @param {SQL} folded - A case-folded text.
 * @returns {SQL} The text with the plain letters.
 */
function withPlainLetters(folded: SQL): SQL {
  let replaced: SQL = folded;
  for (const [ligature, letters] of LIGATURES) {
    replaced = sql`replace(${replaced}, ${sql.raw(`'${ligature}'`)}, ${sql.raw(`'${letters}'`)})`;
  }
  return sql`translate(${replaced}, ${sql.raw(`'${LETTERS_WITHOUT_DECOMPOSITION.from}'`)}, ${sql.raw(`'${LETTERS_WITHOUT_DECOMPOSITION.to}'`)})`;
}

/**
 * Function withoutMarks
 *
 * @description
 * Decomposes a text (NFKD) and removes its combining marks.
 *
 * @param {SQL} text - The text.
 * @returns {SQL} The text without accents.
 */
function withoutMarks(text: SQL): SQL {
  return sql`regexp_replace(normalize(${text}, NFKD), ${sql.raw(`'${COMBINING_MARKS}'`)}, '', 'g')`;
}

/**
 * Function foldText
 *
 * @description
 * The expression `F(x)` that compares text "without regard to case or accents"
 * (`openapi/public/tasks.yaml:225-226`): Unicode case folding, the letters NFKD cannot decompose
 * (`œ`, `æ`, `ø`, `ł`, `đ`, ...) replaced by their plain letters, compatibility decomposition
 * (NFKD), then the combining marks removed. It uses PostgreSQL 18 core functions only (`casefold`,
 * `normalize`, `replace`, `translate` and the built-in collation `pg_unicode_fast`), so it needs no
 * extension, and a UTF8 database. It is immutable. Both sides of every comparison use it.
 *
 * A text bound as a parameter is folded in full, once per statement. A column or an expression is
 * folded per row, so the expression takes the cheapest path that gives the same result: an ASCII
 * text (as many bytes as characters) is only lower-cased, a text without any letter of
 * `LETTERS_TO_REPLACE` skips the replacements (`translate` alone costs more than the rest of the
 * fold on short texts), and the others take the full fold.
 *
 * @param {AnyPgColumn | SQL | string} value - A column, an expression, or a text bound as a
 * parameter.
 * @returns {SQL} The folded text.
 */
export function foldText(value: AnyPgColumn | SQL | string): SQL {
  const text: SQL = sql`(${value})::text collate "pg_unicode_fast"`;
  const full: SQL = withoutMarks(withPlainLetters(sql`casefold(${text})`));
  if (typeof value === 'string') {
    return full;
  }
  const simple: SQL = withoutMarks(sql`casefold(${text})`);
  return sql`(case when octet_length(${text}) = char_length(${text}) then lower(${text}) when ${text} ~ ${sql.raw(`'${LETTERS_TO_REPLACE}'`)} then ${full} else ${simple} end)`;
}
