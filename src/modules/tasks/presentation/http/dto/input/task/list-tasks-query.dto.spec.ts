import { describe, expect, it } from 'vitest';

import { ListTasksQuery } from './list-tasks-query.dto.js';

const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

/**
 * Parses a query and returns the members the issues name.
 *
 * @param query - The query as the HTTP parser gives it.
 * @returns The first segment of the path of each issue, `null` when the query is accepted.
 */
function refusedMembers(query: unknown): readonly PropertyKey[] | null {
  const result = ListTasksQuery.schema.safeParse(query);
  return result.success ? null : result.error.issues.map((issue) => issue.path[0] ?? '');
}

describe('the query of the tasks of a list', () => {
  it('applies the defaults of the contract: the top-level tasks, in the order of the list, 50 a page', () => {
    expect(ListTasksQuery.schema.parse({})).toStrictEqual({
      level: 'roots',
      sort: 'manual',
      limit: 50,
    });
  });

  it('reads the four lists from comma-separated texts or repeated parameters', () => {
    expect(
      ListTasksQuery.schema.parse({
        status: 'progress,review',
        priority: ['urgente', 'haute,moyenne'],
        assignee: `me,none,${CAMILLE}`,
        label: 'Auth,Design',
      }),
    ).toMatchObject({
      status: ['progress', 'review'],
      priority: ['urgente', 'haute', 'moyenne'],
      assignee: ['me', 'none', CAMILLE],
      label: ['Auth', 'Design'],
    });
  });

  it('reads the scalar members as sent and coerces the page size', () => {
    expect(
      ListTasksQuery.schema.parse({
        search: 'sso',
        dueFrom: '2026-11-01',
        dueTo: '2026-11-30',
        level: 'all',
        sort: '-dueDate',
        cursor: 'abc',
        limit: '100',
      }),
    ).toMatchObject({
      search: 'sso',
      dueFrom: '2026-11-01',
      dueTo: '2026-11-30',
      level: 'all',
      sort: '-dueDate',
      cursor: 'abc',
      limit: 100,
    });
  });

  it.each([
    'manual',
    '-manual',
    'dueDate',
    '-dueDate',
    'priority',
    '-priority',
    'name',
    '-name',
    'createdAt',
    '-createdAt',
  ])('accepts the sort %s', (sort) => {
    expect(ListTasksQuery.schema.parse({ sort }).sort).toBe(sort);
  });

  it('refuses a sort, a level, a status or a priority outside their sets, on the member', () => {
    expect(refusedMembers({ sort: 'size' })).toEqual(['sort']);
    expect(refusedMembers({ level: 'subtasks' })).toEqual(['level']);
    expect(refusedMembers({ status: 'progress,started' })).toEqual(['status']);
    expect(refusedMembers({ priority: 'critical' })).toEqual(['priority']);
  });

  it('refuses an empty item, too many items and an assignee that is not me, none or an account', () => {
    const eleven: string = Array.from({ length: 11 }, () => 'todo').join(',');
    const twentyOne: string = Array.from({ length: 21 }, (_, index) => `l${String(index)}`).join(
      ',',
    );

    expect(refusedMembers({ status: ',todo' })).toEqual(['status']);
    expect(refusedMembers({ status: eleven })).toEqual(['status']);
    expect(refusedMembers({ label: twentyOne })).toEqual(['label']);
    expect(refusedMembers({ label: 'a'.repeat(33) })).toEqual(['label']);
    expect(refusedMembers({ assignee: 'camille' })).toEqual(['assignee']);
    expect(refusedMembers({ assignee: 'me,' })).toEqual(['assignee']);
  });

  it('refuses a page size outside 1 to 100, an empty or too long search and a date that is not one', () => {
    expect(refusedMembers({ limit: '0' })).toEqual(['limit']);
    expect(refusedMembers({ limit: '101' })).toEqual(['limit']);
    expect(refusedMembers({ search: '' })).toEqual(['search']);
    expect(refusedMembers({ search: 'a'.repeat(101) })).toEqual(['search']);
    expect(refusedMembers({ dueFrom: '2026-11-31' })).toEqual(['dueFrom']);
    expect(refusedMembers({ dueTo: 'tomorrow' })).toEqual(['dueTo']);
  });

  it('refuses a due date of the year 0000, which PostgreSQL cannot store, on the member', () => {
    expect(refusedMembers({ dueFrom: '0000-11-03' })).toEqual(['dueFrom']);
    expect(refusedMembers({ dueTo: '0000-01-01' })).toEqual(['dueTo']);
    expect(refusedMembers({ dueFrom: '0001-01-01', dueTo: '9999-12-31' })).toBeNull();
  });

  it('refuses U+0000 in the search and in a label, on the member', () => {
    expect(refusedMembers({ search: 'sso\u0000' })).toEqual(['search']);
    expect(refusedMembers({ label: 'Au\u0000th' })).toEqual(['label']);
    expect(refusedMembers({ label: ['Auth', 'a\u0000b'] })).toEqual(['label']);
  });

  it('keeps the year 0000 in the search text, which only reads like a date', () => {
    expect(refusedMembers({ search: '0000-11-03' })).toBeNull();
  });
});
