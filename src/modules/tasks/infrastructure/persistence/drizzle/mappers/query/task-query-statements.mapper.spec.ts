import { describe, expect, it } from 'vitest';

import type { TaskFilter } from '../../../../../application/models/query/task-filter.model.js';
import { renderSql } from './query-sql.fixture.js';
import { countStatement, groupStatement, pageStatement } from './task-query-statements.mapper.js';

const NONE: TaskFilter = {
  statuses: null,
  priorities: null,
  assignees: null,
  labelKeys: null,
  search: null,
  dueFrom: null,
  dueTo: null,
  rootsOnly: true,
};

const SELECTED: string = [
  '"tasks"."id" as "id"',
  '"tasks"."key_prefix" as "keyPrefix"',
  '"tasks"."key_number" as "keyNumber"',
  '"tasks"."name" as "name"',
  '"tasks"."status" as "status"',
  '"tasks"."cancel_reason" as "cancelReason"',
  '"tasks"."priority" as "priority"',
  '"tasks"."due_date"::text as "dueDate"',
  '"tasks"."start_date"::text as "startDate"',
  '"tasks"."estimate_minutes" as "estimateMinutes"',
  `to_char("tasks"."completed_at" at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "completedAt"`,
  `to_char("tasks"."created_at" at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`,
  '"tasks"."list_id" as "listId"',
  '"tasks"."space_id" as "spaceId"',
  '"tasks"."parent_id" as "parentId"',
  '"tasks"."version" as "version"',
].join(', ');

const WHERE: string =
  '("tasks"."organization_id" = $1 and "tasks"."list_id" = $2 and ("tasks"."archived_at" is null and "tasks"."trash_entry_id" is null) and "tasks"."parent_id" is null)';

describe('pageStatement: one page of the tasks of a list', () => {
  it('selects the columns of a summary, filters, orders and limits in one statement', () => {
    expect(
      renderSql(pageStatement('org', 'list', NONE, { key: 'manual', descending: false }, null, 51)),
    ).toEqual({
      sql: `select ${SELECTED}, null::text as "sortValue" from "tasks" where ${WHERE} order by "tasks"."created_at", "tasks"."id" limit $3`,
      params: ['org', 'list', 51],
    });
  });

  it('adds the keyset condition before the order by', () => {
    const rendered = renderSql(
      pageStatement(
        'org',
        'list',
        NONE,
        { key: 'dueDate', descending: false },
        { sortValue: '2026-11-05', createdAt: new Date('2026-11-02T09:00:00.000Z'), id: 'last' },
        10,
      ),
    );

    expect(rendered.sql).toContain(
      `${WHERE} and (coalesce("tasks"."due_date", 'infinity'::date), "tasks"."created_at", "tasks"."id") > ($3::date, $4::timestamptz, $5::uuid) order by`,
    );
    expect(rendered.params).toEqual([
      'org',
      'list',
      '2026-11-05',
      '2026-11-02T09:00:00.000Z',
      'last',
      10,
    ]);
  });

  it('never selects the description, which a row of a list does not show', () => {
    expect(
      renderSql(pageStatement('org', 'list', NONE, { key: 'manual', descending: false }, null, 1))
        .sql,
    ).not.toContain('description');
  });
});

describe('countStatement: the total of a filter', () => {
  it('counts with the same condition as the page', () => {
    expect(renderSql(countStatement('org', 'list', NONE))).toEqual({
      sql: `select count(*)::int as "total" from "tasks" where ${WHERE}`,
      params: ['org', 'list'],
    });
  });
});

describe('groupStatement: the counts by status, priority or assignee', () => {
  it('groups the status in one scan', () => {
    expect(renderSql(groupStatement('org', 'list', NONE, 'status'))).toEqual({
      sql: `select "tasks"."status" as "value", count(*)::int as "count" from "tasks" where ${WHERE} group by "tasks"."status"`,
      params: ['org', 'list'],
    });
  });

  it('groups the priority in one scan', () => {
    expect(renderSql(groupStatement('org', 'list', NONE, 'priority')).sql).toBe(
      `select "tasks"."priority" as "value", count(*)::int as "count" from "tasks" where ${WHERE} group by "tasks"."priority"`,
    );
  });

  it('counts a task in each of its assignees, the tasks nobody has as none, and every task once, in one scan', () => {
    expect(renderSql(groupStatement('org', 'list', NONE, 'assignee'))).toEqual({
      sql:
        `select coalesce("grouped_assignees"."user_id"::text, 'none') as "value", count(distinct "tasks"."id")::int as "count", (grouping("grouped_assignees"."user_id") = 1) as "total" from "tasks" ` +
        'left join "task_assignees" as "grouped_assignees" on "grouped_assignees"."organization_id" = "tasks"."organization_id" and "grouped_assignees"."task_id" = "tasks"."id" ' +
        `where ${WHERE} group by grouping sets (("grouped_assignees"."user_id"), ())`,
      params: ['org', 'list'],
    });
  });
});
