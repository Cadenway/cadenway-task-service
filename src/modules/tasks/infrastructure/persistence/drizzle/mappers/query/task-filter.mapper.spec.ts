import { describe, expect, it } from 'vitest';

import type { TaskFilter } from '../../../../../application/models/query/task-filter.model.js';
import { foldedSql, renderSql } from './query-sql.fixture.js';
import { taskFilterCondition } from './task-filter.mapper.js';

const NONE: TaskFilter = {
  statuses: null,
  priorities: null,
  assignees: null,
  labelKeys: null,
  search: null,
  dueFrom: null,
  dueTo: null,
  rootsOnly: false,
};

const ASSIGNEES: string =
  'select 1 from "task_assignees" where "task_assignees"."organization_id" = "tasks"."organization_id" and "task_assignees"."task_id" = "tasks"."id"';
const LABELS: string =
  'select 1 from "task_labels" where "task_labels"."organization_id" = "tasks"."organization_id" and "task_labels"."task_id" = "tasks"."id"';

describe('taskFilterCondition: the where of the tasks of one list', () => {
  it('names the organization and the list when no filter is set', () => {
    expect(renderSql(taskFilterCondition('org', 'list', NONE))).toEqual({
      sql: '("tasks"."organization_id" = $1 and "tasks"."list_id" = $2)',
      params: ['org', 'list'],
    });
  });

  it('keeps the top-level tasks only for the level roots', () => {
    expect(renderSql(taskFilterCondition('org', 'list', { ...NONE, rootsOnly: true })).sql).toBe(
      '("tasks"."organization_id" = $1 and "tasks"."list_id" = $2 and "tasks"."parent_id" is null)',
    );
  });

  it('adds the values of one filter up as one array parameter and narrows with the next filter', () => {
    const rendered = renderSql(
      taskFilterCondition('org', 'list', {
        ...NONE,
        statuses: ['todo', 'progress'],
        priorities: ['haute'],
      }),
    );

    expect(rendered).toEqual({
      sql: '("tasks"."organization_id" = $1 and "tasks"."list_id" = $2 and "tasks"."status" = any($3::text[]) and "tasks"."priority" = any($4::text[]))',
      params: ['org', 'list', ['todo', 'progress'], ['haute']],
    });
  });

  it('matches the asked accounts or the tasks nobody is assigned to', () => {
    const rendered = renderSql(
      taskFilterCondition('org', 'list', {
        ...NONE,
        assignees: { userIds: ['u1', 'u2'], unassigned: true },
      }),
    );

    expect(rendered).toEqual({
      sql: `("tasks"."organization_id" = $1 and "tasks"."list_id" = $2 and (exists (${ASSIGNEES} and "task_assignees"."user_id" = any($3::uuid[])) or not exists (${ASSIGNEES})))`,
      params: ['org', 'list', ['u1', 'u2']],
    });
  });

  it('writes each assignee branch only when it is asked', () => {
    const accounts = renderSql(
      taskFilterCondition('org', 'list', {
        ...NONE,
        assignees: { userIds: ['u1'], unassigned: false },
      }),
    ).sql;
    const nobody = renderSql(
      taskFilterCondition('org', 'list', { ...NONE, assignees: { userIds: [], unassigned: true } }),
    ).sql;

    expect(accounts).toContain(
      `(exists (${ASSIGNEES} and "task_assignees"."user_id" = any($3::uuid[])))`,
    );
    expect(accounts).not.toContain('not exists');
    expect(nobody).toContain(`(not exists (${ASSIGNEES}))`);
    expect(nobody).not.toContain('any(');
  });

  it('matches nothing when the assignee filter has neither accounts nor none', () => {
    expect(
      renderSql(
        taskFilterCondition('org', 'list', {
          ...NONE,
          assignees: { userIds: [], unassigned: false },
        }),
      ).sql,
    ).toBe('("tasks"."organization_id" = $1 and "tasks"."list_id" = $2 and false)');
  });

  it('finds a task with any of the label keys through a semi-join', () => {
    expect(
      renderSql(taskFilterCondition('org', 'list', { ...NONE, labelKeys: ['auth', 'api'] })),
    ).toEqual({
      sql: `("tasks"."organization_id" = $1 and "tasks"."list_id" = $2 and exists (${LABELS} and "task_labels"."label_key" = any($3::text[])))`,
      params: ['org', 'list', ['auth', 'api']],
    });
  });

  it('looks for the folded text in the name, the lower-cased key and the labels, without LIKE wildcards', () => {
    const rendered = renderSql(taskFilterCondition('org', 'list', { ...NONE, search: '50%_' }));

    expect(rendered.sql).toBe(
      '("tasks"."organization_id" = $1 and "tasks"."list_id" = $2 and (' +
        `${foldedSql('$3')} <> '' and (` +
        `strpos(${foldedSql('"tasks"."name"')}, ${foldedSql('$4')}) > 0 or ` +
        `strpos(lower("tasks"."key_prefix" || '-' || "tasks"."key_number"::text), ${foldedSql('$5')}) > 0 or ` +
        `exists (${LABELS} and strpos(${foldedSql('"task_labels"."label_key"')}, ${foldedSql('$6')}) > 0))))`,
    );
    expect(rendered.params).toEqual(['org', 'list', '50%_', '50%_', '50%_', '50%_']);
  });

  it('does not fold the key, which is ASCII, and matches nothing for a search that folds to nothing', () => {
    const rendered = renderSql(taskFilterCondition('org', 'list', { ...NONE, search: 'cad' }));

    expect(rendered.sql).not.toContain(foldedSql('"tasks"."key_prefix"'));
    expect(rendered.sql).toContain(`and (${foldedSql('$3')} <> '' and (`);
  });

  it('bounds the due date on both ends, inclusive, so an undated task is left out', () => {
    expect(
      renderSql(
        taskFilterCondition('org', 'list', { ...NONE, dueFrom: '2026-11-01', dueTo: '2026-11-30' }),
      ),
    ).toEqual({
      sql: '("tasks"."organization_id" = $1 and "tasks"."list_id" = $2 and "tasks"."due_date" >= $3::date and "tasks"."due_date" <= $4::date)',
      params: ['org', 'list', '2026-11-01', '2026-11-30'],
    });
  });
});
