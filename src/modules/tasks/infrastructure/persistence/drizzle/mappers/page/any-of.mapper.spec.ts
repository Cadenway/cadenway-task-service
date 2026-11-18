import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { CAD_482, CAD_483 } from '../../../../../domain/tasks.fixture.js';
import { activityEntries } from '../../schemas/activity/activity-entry.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { anyOf } from './any-of.mapper.js';

describe('anyOf: one array parameter whatever the number of values', () => {
  it('binds the ids as a single uuid array', () => {
    const query = new PgDialect().sqlToQuery(
      sql`select 1 where ${anyOf(tasks.id, [CAD_482, CAD_483], 'uuid')}`,
    );

    expect(query.sql).toBe('select 1 where "tasks"."id" = any($1::uuid[])');
    expect(query.params).toEqual([[CAD_482, CAD_483]]);
  });

  it('binds the kinds as a single text array, and an empty set stays one parameter', () => {
    const query = new PgDialect().sqlToQuery(
      sql`select 1 where ${anyOf(activityEntries.kind, [], 'text')}`,
    );

    expect(query.sql).toBe('select 1 where "activity_entries"."kind" = any($1::text[])');
    expect(query.params).toEqual([[]]);
  });
});
