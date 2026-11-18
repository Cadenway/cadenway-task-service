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
});
