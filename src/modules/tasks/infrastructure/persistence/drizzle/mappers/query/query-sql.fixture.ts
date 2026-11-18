import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * Function renderSql
 *
 * @description
 * Renders a statement or a fragment as the text and the parameters PostgreSQL receives.
 *
 * @param {SQL | undefined} fragment - The statement or the fragment.
 * @returns {{ sql: string; params: unknown[] }} The text and the parameters.
 * @throws {Error} When there is nothing to render.
 */
export function renderSql(fragment: SQL | undefined): { sql: string; params: unknown[] } {
  if (fragment === undefined) {
    throw new Error('Expected a fragment.');
  }
  const { sql: text, params } = new PgDialect().sqlToQuery(fragment);
  return { sql: text, params };
}

/**
 * Function foldedSql
 *
 * @description
 * The text of `F(expression)`, the fold the statements apply on both sides of a comparison: case
 * folding, the ligatures and stroked letters replaced, NFKD, the combining marks removed. A bound
 * parameter (`$3`) is folded in full; a column or an expression takes the guarded form (ASCII,
 * without a letter to replace, or full).
 *
 * @param {string} expression - The SQL of the folded expression.
 * @returns {string} The folded expression.
 */
export function foldedSql(expression: string): string {
  const bs: string = String.fromCharCode(92);
  const marks: string = [
    '0300-' + bs + 'u036f',
    '1ab0-' + bs + 'u1aff',
    '1dc0-' + bs + 'u1dff',
    '20d0-' + bs + 'u20ff',
    'fe20-' + bs + 'ufe2f',
  ].join(bs + 'u');
  const text: string = `(${expression})::text collate "pg_unicode_fast"`;
  const without = (folded: string): string =>
    `regexp_replace(normalize(${folded}, NFKD), '[${bs}u${marks}]', '', 'g')`;
  const ligatures: string = `replace(replace(casefold(${text}), 'œ', 'oe'), 'æ', 'ae')`;
  const full: string = without(`translate(${ligatures}, 'øłđðħŧı', 'olddhti')`);
  if (/^\$\d+$/u.test(expression)) {
    return full;
  }
  return `(case when octet_length(${text}) = char_length(${text}) then lower(${text}) when ${text} ~ '[œæøłđðħŧıŒÆØŁĐÐĦŦ]' then ${full} else ${without(`casefold(${text})`)} end)`;
}
