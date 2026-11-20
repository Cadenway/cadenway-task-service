import { describe, expect, it } from 'vitest';

import { milestoneTotalStatement, milestonesStatement } from './milestone-statements.mapper.js';
import { renderSql } from './query-sql.fixture.js';

describe('milestone statements', () => {
  it('scopes pages and counts to the organization, supplied lists and live milestones', () => {
    for (const statement of [
      milestonesStatement('org', ['list'], null, 51),
      milestoneTotalStatement('org', ['list']),
    ]) {
      const rendered = renderSql(statement);
      expect(rendered.sql).toContain('"tasks"."organization_id" = $1::uuid');
      expect(rendered.sql).toContain('"tasks"."list_id" = any($2::uuid[])');
      expect(rendered.sql).toContain('"tasks"."milestone" = true');
      expect(rendered.sql).toContain('"tasks"."archived_at" is null');
      expect(rendered.sql).toContain('"tasks"."trash_entry_id" is null');
      expect(rendered.params.slice(0, 2)).toEqual(['org', ['list']]);
    }
  });

  it('resumes after the due date and id, with undated milestones last', () => {
    const rendered = renderSql(
      milestonesStatement('org', ['list'], { dueDate: '2026-11-10', id: 'last' }, 21),
    );

    expect(rendered.sql).toContain(
      `(coalesce("tasks"."due_date", 'infinity'::date), "tasks"."id") > (coalesce($3::date, 'infinity'::date), $4::uuid)`,
    );
    expect(rendered.sql).toContain('order by "tasks"."due_date" asc nulls last, "tasks"."id" asc');
    expect(rendered.params).toEqual(['org', ['list'], '2026-11-10', 'last', 21]);
  });

  it('continues inside the undated group when the preceding milestone has no date', () => {
    const rendered = renderSql(
      milestonesStatement('org', ['list'], { dueDate: null, id: 'last' }, 5),
    );

    expect(rendered.params).toEqual(['org', ['list'], null, 'last', 5]);
    expect(rendered.sql).toContain(`coalesce($3::date, 'infinity'::date)`);
  });
});
