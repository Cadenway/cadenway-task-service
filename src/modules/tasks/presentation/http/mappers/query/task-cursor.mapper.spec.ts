import { encodeCursor, ProblemException } from '@cadenway/nest-common';
import type { CursorValue } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import type { TaskFilterInput } from '../../../../application/models/query/task-filter-input.model.js';
import type { TaskPosition } from '../../../../application/models/query/task-position.model.js';
import type { ListTasksQuery } from '../../dto/input/task/list-tasks-query.dto.js';
import { toTaskCursor, toTaskPosition } from './task-cursor.mapper.js';
import { taskFilterFingerprint } from './task-filter.mapper.js';

const listId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02';
const camille = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';
const taskId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
const createdAt = new Date('2026-11-18T10:15:30.123Z');

const filter: TaskFilterInput = {
  statuses: ['progress', 'review'],
  priorities: null,
  assignees: ['me', camille],
  labels: ['Auth'],
  search: 'sso',
  dueFrom: '2026-11-01',
  dueTo: null,
  level: 'roots',
};

/** The position the infrastructure gives for each sort, with the sort value its order reads. */
const positions: readonly (readonly [ListTasksQuery['sort'], TaskPosition])[] = [
  ['manual', { sortValue: null, createdAt, id: taskId }],
  ['-manual', { sortValue: null, createdAt, id: taskId }],
  ['createdAt', { sortValue: null, createdAt, id: taskId }],
  ['-createdAt', { sortValue: null, createdAt, id: taskId }],
  ['dueDate', { sortValue: '2026-11-08', createdAt, id: taskId }],
  ['-dueDate', { sortValue: '0001-01-01', createdAt, id: taskId }],
  ['dueDate', { sortValue: null, createdAt, id: taskId }],
  ['-dueDate', { sortValue: null, createdAt, id: taskId }],
  ['priority', { sortValue: 1, createdAt, id: taskId }],
  ['-priority', { sortValue: 4, createdAt, id: taskId }],
  ['name', { sortValue: 'refonte du parcours d’authentification', createdAt, id: taskId }],
  ['-name', { sortValue: 'écran', createdAt, id: taskId }],
];

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
 * Forges a cursor of the collection of a list and a sort that carries the values it is given: the
 * cursor is not signed, so a caller can write the fingerprint of the collection they ask for.
 *
 * @param sort - The sort of the request.
 * @param values - The `sort` array of the cursor.
 * @param id - The id of the cursor.
 * @returns The cursor.
 */
function forged(
  sort: ListTasksQuery['sort'],
  values: readonly CursorValue[],
  id: string = taskId,
): string {
  return encodeCursor(
    { sort: values, id },
    { collection: 'list-tasks', listId, ...taskFilterFingerprint(filter), sort },
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

describe('the cursor of the tasks of a list', () => {
  it('gives the last page no cursor and the first page no position', () => {
    expect(toTaskCursor(null, listId, filter, 'manual')).toBeNull();
    expect(toTaskPosition(undefined, listId, filter, 'manual')).toBeNull();
  });

  it.each(positions)(
    'decodes the cursor of the sort %s to the position it was built from',
    (sort, position) => {
      const cursor: string | null = toTaskCursor(position, listId, filter, sort);

      expect(cursor).not.toBeNull();
      expect(toTaskPosition(cursor ?? undefined, listId, filter, sort)).toEqual(position);
    },
  );

  it('carries the creation instant alone for manual and createdAt, the value first for the others', () => {
    const decoded = (sort: ListTasksQuery['sort'], position: TaskPosition): unknown => {
      const cursor: string | null = toTaskCursor(position, listId, filter, sort);
      return JSON.parse(Buffer.from(cursor ?? '', 'base64url').toString('utf8')) as unknown;
    };

    expect(decoded('manual', { sortValue: null, createdAt, id: taskId })).toMatchObject({
      s: ['2026-11-18T10:15:30.123Z'],
    });
    expect(decoded('dueDate', { sortValue: null, createdAt, id: taskId })).toMatchObject({
      s: [null, '2026-11-18T10:15:30.123Z'],
    });
    expect(decoded('priority', { sortValue: 2, createdAt, id: taskId })).toMatchObject({
      s: [2, '2026-11-18T10:15:30.123Z'],
    });
  });

  it('decodes the cursor whatever the case of the list and the order or duplicates of the filters', () => {
    const position: TaskPosition = { sortValue: 3, createdAt, id: taskId };
    const cursor: string | null = toTaskCursor(
      position,
      listId.toUpperCase(),
      { ...filter, statuses: ['review', 'progress', 'review'], assignees: [camille, 'me'] },
      'priority',
    );

    expect(toTaskPosition(cursor ?? undefined, listId, filter, 'priority')).toEqual(position);
  });

  it('refuses the cursor of another list, other filters, another sort or another collection', () => {
    const position: TaskPosition = { sortValue: 3, createdAt, id: taskId };
    const cursor: string | undefined =
      toTaskCursor(position, listId, filter, 'priority') ?? undefined;
    const otherCollection: string = encodeCursor(
      { sort: [3, createdAt.toISOString()], id: taskId },
      { collection: 'task-groups', listId },
    );

    expectInvalidCursor(() =>
      toTaskPosition(cursor, '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03', filter, 'priority'),
    );
    expectInvalidCursor(() =>
      toTaskPosition(cursor, listId, { ...filter, search: 'sso2' }, 'priority'),
    );
    expectInvalidCursor(() =>
      toTaskPosition(cursor, listId, { ...filter, level: 'all' }, 'priority'),
    );
    expectInvalidCursor(() => toTaskPosition(cursor, listId, filter, '-priority'));
    expectInvalidCursor(() => toTaskPosition(otherCollection, listId, filter, 'priority'));
  });

  it('refuses a malformed cursor and one over 2048 characters', () => {
    expectInvalidCursor(() => toTaskPosition('not a cursor', listId, filter, 'manual'));
    expectInvalidCursor(() => toTaskPosition('e30', listId, filter, 'manual'));
    expectInvalidCursor(() =>
      toTaskPosition(
        forged('manual', [createdAt.toISOString()]) + 'A'.repeat(2048),
        listId,
        filter,
        'manual',
      ),
    );
  });

  it('refuses a creation instant that is not one the service writes, whatever the sort', () => {
    for (const instant of [
      'not a date',
      '2026-11-18',
      '2026-11-18T10:15:30Z',
      '12026-11-18T10:15:30.123Z',
      '1969-12-31T23:59:59.999Z',
    ]) {
      expectInvalidCursor(() =>
        toTaskPosition(forged('manual', [instant]), listId, filter, 'manual'),
      );
      expectInvalidCursor(() =>
        toTaskPosition(forged('priority', [1, instant]), listId, filter, 'priority'),
      );
    }
    expectInvalidCursor(() => toTaskPosition(forged('manual', [42]), listId, filter, 'manual'));
  });

  it('refuses a sort array of the wrong length', () => {
    const instant: string = createdAt.toISOString();

    expectInvalidCursor(() => toTaskPosition(forged('manual', []), listId, filter, 'manual'));
    expectInvalidCursor(() =>
      toTaskPosition(forged('manual', [instant, instant]), listId, filter, 'manual'),
    );
    expectInvalidCursor(() =>
      toTaskPosition(forged('dueDate', [instant]), listId, filter, 'dueDate'),
    );
    expectInvalidCursor(() =>
      toTaskPosition(forged('name', ['a', 'b', instant]), listId, filter, 'name'),
    );
  });

  it('refuses a due date of the year 0000, that does not exist or that is not a date', () => {
    const instant: string = createdAt.toISOString();

    for (const due of [
      '0000-11-03',
      '2026-02-30',
      '2026-13-01',
      '2026-11-31',
      '2026-1-3',
      '12026-11-03',
      '2026-11-03T08:00',
      'tomorrow',
      20261103,
      true,
    ]) {
      expectInvalidCursor(() =>
        toTaskPosition(forged('dueDate', [due, instant]), listId, filter, 'dueDate'),
      );
      expectInvalidCursor(() =>
        toTaskPosition(forged('-dueDate', [due, instant]), listId, filter, '-dueDate'),
      );
    }
  });

  it('accepts a leap day and the year 0001 as a due date', () => {
    const instant: string = createdAt.toISOString();

    expect(
      toTaskPosition(forged('dueDate', ['2028-02-29', instant]), listId, filter, 'dueDate'),
    ).toMatchObject({ sortValue: '2028-02-29' });
    expect(
      toTaskPosition(forged('dueDate', ['0001-01-01', instant]), listId, filter, 'dueDate'),
    ).toMatchObject({ sortValue: '0001-01-01' });
    expect(() =>
      toTaskPosition(forged('dueDate', ['2027-02-29', instant]), listId, filter, 'dueDate'),
    ).toThrow(ProblemException);
  });

  it('refuses a priority rank outside 1 to 4, a fraction or a text', () => {
    const instant: string = createdAt.toISOString();

    for (const rank of [0, 5, -1, 2.5, '1', 'urgente', null, false]) {
      expectInvalidCursor(() =>
        toTaskPosition(forged('priority', [rank, instant]), listId, filter, 'priority'),
      );
      expectInvalidCursor(() =>
        toTaskPosition(forged('-priority', [rank, instant]), listId, filter, '-priority'),
      );
    }
  });

  it('refuses a name prefix over 128 code points, with U+0000, a lone surrogate or not a text', () => {
    const instant: string = createdAt.toISOString();

    for (const prefix of ['a'.repeat(129), '🚀'.repeat(129), 'a\u0000b', 'a\ud800b', 5, null]) {
      expectInvalidCursor(() =>
        toTaskPosition(forged('name', [prefix, instant]), listId, filter, 'name'),
      );
      expectInvalidCursor(() =>
        toTaskPosition(forged('-name', [prefix, instant]), listId, filter, '-name'),
      );
    }
  });

  it('accepts a name prefix of exactly 128 code points, also outside the basic plane', () => {
    const instant: string = createdAt.toISOString();
    const prefix: string = '🚀'.repeat(128);

    expect(toTaskPosition(forged('name', [prefix, instant]), listId, filter, 'name')).toMatchObject(
      { sortValue: prefix },
    );
  });

  it('refuses an id that is not a UUID, without quoting it', () => {
    const refusal: ProblemException = refusalOf(() =>
      toTaskPosition(
        forged('manual', [createdAt.toISOString()], "1' OR '1'='1"),
        listId,
        filter,
        'manual',
      ),
    );

    expect(refusal.problem.status).toBe(400);
    expect(JSON.stringify(refusal.problem)).not.toContain('OR');
  });
});
