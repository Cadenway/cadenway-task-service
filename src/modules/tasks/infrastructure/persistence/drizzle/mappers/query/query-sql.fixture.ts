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
 * The text of `F(expression)`, the fold the statements apply on both sides of a comparison.
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
  return `regexp_replace(normalize(casefold((${expression})::text collate "pg_unicode_fast"), NFKD), '[${bs}u${marks}]', '', 'g')`;
}
