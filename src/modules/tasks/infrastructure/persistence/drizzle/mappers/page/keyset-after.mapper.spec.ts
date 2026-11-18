import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { CAD_483 } from '../../../../../domain/tasks.fixture.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { keysetAfter } from './keyset-after.mapper.js';

/**
 * Renders a condition as the statement and the parameters PostgreSQL receives.
 *
 * @param condition - The condition.
 * @returns The text and the parameters.
 * @throws When there is no condition.
 */
function render(condition: SQL | undefined): { sql: string; params: unknown[] } {
  if (condition === undefined) {
    throw new Error('Expected a condition.');
  }
  const { sql: text, params } = new PgDialect().sqlToQuery(sql`select 1 where ${condition}`);
  return { sql: text, params };
}

describe('keysetAfter: strictly past the position in the order created_at, id', () => {
  it('adds no condition on the first page', () => {
    expect(keysetAfter(tasks.createdAt, tasks.id, null)).toBeUndefined();
  });

  it('compares the row value to the position', () => {
    const condition = keysetAfter(tasks.createdAt, tasks.id, {
      createdAt: new Date('2026-11-02T09:00:00.000Z'),
      id: CAD_483,
    });

    expect(render(condition)).toEqual({
      sql: 'select 1 where ("tasks"."created_at", "tasks"."id") > ($1::timestamptz, $2::uuid)',
      params: ['2026-11-02T09:00:00.000Z', CAD_483],
    });
  });
});
