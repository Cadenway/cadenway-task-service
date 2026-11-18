import { describe, expect, it } from 'vitest';

import { TaskGroupsQuery } from './task-groups-query.dto.js';

/**
 * Parses a query and returns the members the issues name.
 *
 * @param query - The query as the HTTP parser gives it.
 * @returns The first segment of the path of each issue, `null` when the query is accepted.
 */
function refusedMembers(query: unknown): readonly PropertyKey[] | null {
  const result = TaskGroupsQuery.schema.safeParse(query);
  return result.success ? null : result.error.issues.map((issue) => issue.path[0] ?? '');
}

describe('the query of the groups of a list', () => {
  it('requires what to group by and applies the defaults of the contract', () => {
    expect(TaskGroupsQuery.schema.parse({ groupBy: 'status' })).toStrictEqual({
      groupBy: 'status',
      level: 'roots',
      limit: 50,
    });
    expect(refusedMembers({})).toEqual(['groupBy']);
    expect(refusedMembers({ groupBy: 'label' })).toEqual(['groupBy']);
  });

  it.each(['status', 'priority', 'assignee'])('accepts to group by %s', (groupBy) => {
    expect(TaskGroupsQuery.schema.parse({ groupBy }).groupBy).toBe(groupBy);
  });

  it('reads the four lists from comma-separated texts or repeated parameters', () => {
    expect(
      TaskGroupsQuery.schema.parse({
        groupBy: 'assignee',
        status: 'todo,progress',
        priority: ['haute', 'basse'],
        assignee: 'me,none',
        label: 'Auth,Design',
      }),
    ).toMatchObject({
      status: ['todo', 'progress'],
      priority: ['haute', 'basse'],
      assignee: ['me', 'none'],
      label: ['Auth', 'Design'],
    });
  });

  it('refuses an empty item, a due date of the year 0000 and U+0000, on the member', () => {
    expect(refusedMembers({ groupBy: 'status', status: 'todo,' })).toEqual(['status']);
    expect(refusedMembers({ groupBy: 'status', dueFrom: '0000-11-03' })).toEqual(['dueFrom']);
    expect(refusedMembers({ groupBy: 'status', search: 'a\u0000' })).toEqual(['search']);
  });
});
