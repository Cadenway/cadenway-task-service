import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { tasks } from '../../schemas/task/task.schema.js';
import { foldedSql, renderSql } from './query-sql.fixture.js';
import { foldText } from './text-fold.mapper.js';

describe('foldText: case and accents ignored with PostgreSQL 18 core functions only', () => {
  it('binds a text as a parameter and folds it with casefold, NFKD and the removal of the marks', () => {
    expect(renderSql(sql`select ${foldText('Écran')}`)).toEqual({
      sql: `select ${foldedSql('$1')}`,
      params: ['Écran'],
    });
  });

  it('folds a column with the built-in collation, so no extension is needed', () => {
    const rendered = renderSql(foldText(tasks.name));

    expect(rendered.sql).toBe(foldedSql('"tasks"."name"'));
    expect(rendered.sql).toContain('collate "pg_unicode_fast"');
    expect(rendered.sql).not.toContain('unaccent');
  });

  it('replaces the ligatures and the stroked letters NFKD leaves whole, after the case folding', () => {
    const rendered = renderSql(foldText('Œuvre'));

    expect(rendered.sql).toContain(
      `replace(replace(casefold(($1)::text collate "pg_unicode_fast"), 'œ', 'oe'), 'æ', 'ae')`,
    );
    expect(rendered.sql).toContain(`translate(`);
    expect(rendered.sql).toContain(`'øłđðħŧı', 'olddhti'`);
    // The expression nests from the outside in: normalize(translate(replace(casefold(x)))).
    expect(rendered.sql.indexOf('normalize(')).toBeLessThan(rendered.sql.indexOf('translate('));
    expect(rendered.sql.indexOf('translate(')).toBeLessThan(
      rendered.sql.indexOf('replace(replace('),
    );
    expect(rendered.sql.indexOf('replace(replace(')).toBeLessThan(
      rendered.sql.indexOf('casefold('),
    );
  });

  it('keeps the expression free of extensions and of volatile functions', () => {
    const { sql: text } = renderSql(foldText(tasks.name));

    for (const forbidden of ['unaccent', 'similarity', 'random(', 'now(']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('folds a column per row through the cheapest path: ASCII, no letter to replace, or the full fold', () => {
    const { sql: text } = renderSql(foldText(tasks.name));
    const column = '("tasks"."name")::text collate "pg_unicode_fast"';

    expect(text.startsWith('(case when octet_length(')).toBe(true);
    expect(text).toContain(
      `octet_length(${column}) = char_length(${column}) then lower(${column})`,
    );
    expect(text).toContain(`when ${column} ~ '[œæøłđðħŧıŒÆØŁĐÐĦŦ]' then `);
    expect(text).toContain(' else regexp_replace(normalize(casefold(');
  });

  it('folds a bound text in full, without a branch, whatever it holds', () => {
    const { sql: text } = renderSql(foldText('Œuvre'));

    expect(text).not.toContain('case when');
    expect(text).toContain('translate(');
  });
});
