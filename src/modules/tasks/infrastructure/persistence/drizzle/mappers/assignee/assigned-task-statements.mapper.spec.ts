import { describe, expect, it } from 'vitest';

import { renderSql } from '../query/query-sql.fixture.js';
import { assignedPageStatement } from './assigned-task-statements.mapper.js';

const FROM: string =
  'from "task_assignees" join "tasks" on "tasks"."organization_id" = "task_assignees"."organization_id" and "tasks"."id" = "task_assignees"."task_id" ' +
  'where ("task_assignees"."organization_id" = $1 and "task_assignees"."user_id" = $2 and "tasks"."organization_id" = $3 and "tasks"."space_id" = any($4::uuid[]))';
const DUE_ORDER: string =
  'order by coalesce("tasks"."due_date", \'infinity\'::date), "tasks"."created_at", "tasks"."id"';

describe('assignedPageStatement: a page of Mes taches', () => {
  it('reads the open tab by due date, undated last, scoped to the organization on both tables', () => {
    const rendered = renderSql(assignedPageStatement('org', 'user', ['s1'], 'open', null, 51));

    expect(rendered.sql).toContain(
      `"tasks"."due_date"::text as "sortValue" ${FROM} and "tasks"."status" not in ('done', 'cancelled') ${DUE_ORDER} limit $5`,
    );
    expect(rendered.params).toEqual(['org', 'user', 'org', ['s1'], 51]);
  });

  it('reads the closed tab with done and cancelled', () => {
    expect(
      renderSql(assignedPageStatement('org', 'user', ['s1'], 'closed', null, 8)).sql,
    ).toContain(`and "tasks"."status" in ('done', 'cancelled') ${DUE_ORDER}`);
  });

  it('continues after a position with the due date, the creation and the id', () => {
    const rendered = renderSql(
      assignedPageStatement(
        'org',
        'user',
        ['s1'],
        'open',
        { sortValue: '2026-11-05', createdAt: new Date('2026-11-02T09:00:00.000Z'), id: 'last' },
        8,
      ),
    );

    expect(rendered.sql).toContain(
      `and (coalesce("tasks"."due_date", 'infinity'::date), "tasks"."created_at", "tasks"."id") > ($5::date, $6::timestamptz, $7::uuid) ${DUE_ORDER} limit $8`,
    );
    expect(rendered.params).toEqual([
      'org',
      'user',
      'org',
      ['s1'],
      '2026-11-05',
      '2026-11-02T09:00:00.000Z',
      'last',
      8,
    ]);
  });
});
