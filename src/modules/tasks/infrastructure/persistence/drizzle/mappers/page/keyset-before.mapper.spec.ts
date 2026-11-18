import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { CAD_482 } from '../../../../../domain/tasks.fixture.js';
import { activityEntries } from '../../schemas/activity/activity-entry.schema.js';
import { keysetBefore } from './keyset-before.mapper.js';

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

describe('keysetBefore: strictly older in the order occurred_at DESC, id DESC', () => {
  it('adds no condition on the first page', () => {
    expect(keysetBefore(activityEntries.occurredAt, activityEntries.id, null)).toBeUndefined();
  });

  it('compares the row value to the position, the instant to the millisecond', () => {
    const condition = keysetBefore(activityEntries.occurredAt, activityEntries.id, {
      occurredAt: new Date('2026-11-08T10:19:30.123Z'),
      id: CAD_482,
    });

    expect(render(condition)).toEqual({
      sql: 'select 1 where ("activity_entries"."occurred_at", "activity_entries"."id") < ($1::timestamptz, $2::uuid)',
      params: ['2026-11-08T10:19:30.123Z', CAD_482],
    });
  });
});
