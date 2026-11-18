import { encodeCursor, ProblemException } from '@cadenway/nest-common';
import type { CursorValue } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import type { GroupPosition } from '../../../../application/models/query/group-position.model.js';
import type { TaskFilterInput } from '../../../../application/models/query/task-filter-input.model.js';
import type { TaskGrouping } from '../../../../application/models/query/task-grouping.model.js';
import { toTaskGroupCursor, toTaskGroupPosition } from './task-group-cursor.mapper.js';
import { taskFilterFingerprint } from './task-filter.mapper.js';

const listId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02';
const camille = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

const filter: TaskFilterInput = {
  statuses: null,
  priorities: ['urgente', 'haute'],
  assignees: ['me', 'none'],
  labels: null,
  search: null,
  dueFrom: null,
  dueTo: null,
  level: 'all',
};

/**
 * Runs a decoding and returns the problem it throws.
 *
 * @param decode - The decoding.
 * @returns The problem.
 */
function refusalOf(decode: () => unknown): ProblemException {
  try {
    decode();
  } catch (error) {
    if (error instanceof ProblemException) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected a refusal.');
}

/**
 * Forges a cursor of the groups of a list: the cursor is not signed, so a caller can write the
 * fingerprint of the collection they ask for.
 *
 * @param grouping - What the groups are counted by.
 * @param values - The `sort` array of the cursor.
 * @param id - The id of the cursor, the value of the group.
 * @returns The cursor.
 */
function forged(grouping: TaskGrouping, values: readonly CursorValue[], id: string): string {
  return encodeCursor(
    { sort: values, id },
    { collection: 'task-groups', listId, groupBy: grouping, ...taskFilterFingerprint(filter) },
  );
}

/**
 * Asserts that a decoding answers `400 request.invalid` with the issue on `cursor`.
 *
 * @param decode - The decoding.
 */
function expectInvalidCursor(decode: () => unknown): void {
  const refusal: ProblemException = refusalOf(decode);

  expect(refusal.problem.status).toBe(400);
  expect(refusal.problem.code).toBe('request.invalid');
  expect(refusal.problem.details).toMatchObject({
    issues: [{ in: 'query', path: 'cursor', code: 'invalid_cursor' }],
  });
}

describe('the cursor of the groups of a list', () => {
  const positions: readonly (readonly [TaskGrouping, GroupPosition])[] = [
    ['status', { value: 'progress', count: 7 }],
    ['status', { value: 'cancelled', count: 0 }],
    ['priority', { value: 'moyenne', count: 12 }],
    ['assignee', { value: camille, count: 5 }],
    ['assignee', { value: 'none', count: 0 }],
  ];

  it('gives the last page no cursor and the first page no position', () => {
    expect(toTaskGroupCursor(null, listId, 'status', filter)).toBeNull();
    expect(toTaskGroupPosition(undefined, listId, 'status', filter)).toBeNull();
  });

  it.each(positions)(
    'decodes the cursor of the groups by %s to the position it was built from',
    (grouping, position) => {
      const cursor: string | null = toTaskGroupCursor(position, listId, grouping, filter);

      expect(toTaskGroupPosition(cursor ?? undefined, listId, grouping, filter)).toEqual(position);
    },
  );

  it('decodes the cursor whatever the case of the list and the order of the filters', () => {
    const position: GroupPosition = { value: 'haute', count: 2 };
    const cursor: string | null = toTaskGroupCursor(position, listId.toUpperCase(), 'priority', {
      ...filter,
      priorities: ['haute', 'urgente', 'haute'],
      assignees: ['none', 'me'],
    });

    expect(toTaskGroupPosition(cursor ?? undefined, listId, 'priority', filter)).toEqual(position);
  });

  it('lower-cases the account of an assignee group, the form the groups are ordered in', () => {
    const cursor: string = forged('assignee', [3], camille.toUpperCase());

    expect(toTaskGroupPosition(cursor, listId, 'assignee', filter)).toEqual({
      value: camille,
      count: 3,
    });
  });

  it('refuses the cursor of another grouping, list, filters or collection', () => {
    const cursor: string | undefined =
      toTaskGroupCursor({ value: 'progress', count: 7 }, listId, 'status', filter) ?? undefined;
    const subtasks: string = encodeCursor(
      { sort: [7], id: 'progress' },
      { collection: 'subtasks', taskKey: 'CAD-482' },
    );

    expectInvalidCursor(() => toTaskGroupPosition(cursor, listId, 'priority', filter));
    expectInvalidCursor(() =>
      toTaskGroupPosition(cursor, '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03', 'status', filter),
    );
    expectInvalidCursor(() =>
      toTaskGroupPosition(cursor, listId, 'status', { ...filter, level: 'roots' }),
    );
    expectInvalidCursor(() => toTaskGroupPosition(subtasks, listId, 'status', filter));
    expectInvalidCursor(() => toTaskGroupPosition('not a cursor', listId, 'status', filter));
  });

  it('refuses a value that is not a group of the grouping, which would restart the page', () => {
    expectInvalidCursor(() =>
      toTaskGroupPosition(forged('status', [1], 'urgente'), listId, 'status', filter),
    );
    expectInvalidCursor(() =>
      toTaskGroupPosition(forged('priority', [1], 'done'), listId, 'priority', filter),
    );
    expectInvalidCursor(() =>
      toTaskGroupPosition(forged('assignee', [1], 'task-service'), listId, 'assignee', filter),
    );
    expectInvalidCursor(() =>
      toTaskGroupPosition(forged('status', [1], 'none'), listId, 'status', filter),
    );
  });

  it('refuses a count that is not a whole number from 0 to 2147483647', () => {
    for (const count of [-1, 1.5, 2_147_483_648, '3', null, true]) {
      expectInvalidCursor(() =>
        toTaskGroupPosition(forged('status', [count], 'todo'), listId, 'status', filter),
      );
    }
    expectInvalidCursor(() =>
      toTaskGroupPosition(forged('status', [], 'todo'), listId, 'status', filter),
    );
    expectInvalidCursor(() =>
      toTaskGroupPosition(forged('status', [1, 2], 'todo'), listId, 'status', filter),
    );
  });
});
