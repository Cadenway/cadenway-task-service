import { describe, expect, it } from 'vitest';

import { renderSql } from '../query/query-sql.fixture.js';
import {
  countsOfListsStatement,
  homeStatsStatement,
  stateCountsStatement,
} from './task-counts.mapper.js';

const OPEN: string = '"tasks"."status" not in (\'done\', \'cancelled\')';
const ASSIGNED: string =
  'from "task_assignees" join "tasks" on "tasks"."organization_id" = "task_assignees"."organization_id" and "tasks"."id" = "task_assignees"."task_id" ' +
  'where ("task_assignees"."organization_id" = $';

describe('countsOfListsStatement: the counters of the lists in one grouped scan', () => {
  it('counts the top-level tasks only, closed by done and cancelled, late strictly before today', () => {
    expect(renderSql(countsOfListsStatement('org', ['l1', 'l2'], '2026-11-08'))).toEqual({
      sql:
        'select "tasks"."list_id" as "listId", count(*)::int as "total", ' +
        `(count(*) filter (where ${OPEN}))::int as "open", ` +
        `(count(*) filter (where "tasks"."status" = 'done'))::int as "done", ` +
        `(count(*) filter (where "tasks"."status" = 'cancelled'))::int as "cancelled", ` +
        `(count(*) filter (where ${OPEN} and "tasks"."due_date" < $1::date))::int as "late" ` +
        'from "tasks" where ("tasks"."organization_id" = $2 and "tasks"."list_id" = any($3::uuid[]) and "tasks"."parent_id" is null) ' +
        'group by "tasks"."list_id"',
      params: ['2026-11-08', 'org', ['l1', 'l2']],
    });
  });
});

describe('stateCountsStatement: the tabs of Mes taches', () => {
  it('counts the tasks assigned to the account in the visible lists, subtasks included', () => {
    expect(renderSql(stateCountsStatement('org', 'user', ['l1']))).toEqual({
      sql:
        `select (count(*) filter (where ${OPEN}))::int as "open", ` +
        `(count(*) filter (where "tasks"."status" in ('done', 'cancelled')))::int as "closed" ` +
        `${ASSIGNED}1 and "task_assignees"."user_id" = $2 and "tasks"."organization_id" = $3 and "tasks"."list_id" = any($4::uuid[]))`,
      params: ['org', 'user', 'org', ['l1']],
    });
  });
});

describe('homeStatsStatement: the counters of Accueil', () => {
  it('counts the open, late, due today and done tasks of the account in one scan', () => {
    expect(renderSql(homeStatsStatement('org', 'user', ['l1'], '2026-11-08'))).toEqual({
      sql:
        `select (count(*) filter (where ${OPEN}))::int as "assigned", ` +
        `(count(*) filter (where ${OPEN} and "tasks"."due_date" < $1::date))::int as "late", ` +
        `(count(*) filter (where ${OPEN} and "tasks"."due_date" = $2::date))::int as "dueToday", ` +
        `(count(*) filter (where "tasks"."status" = 'done'))::int as "done" ` +
        `${ASSIGNED}3 and "task_assignees"."user_id" = $4 and "tasks"."organization_id" = $5 and "tasks"."list_id" = any($6::uuid[]))`,
      params: ['2026-11-08', '2026-11-08', 'org', 'user', 'org', ['l1']],
    });
  });
});
