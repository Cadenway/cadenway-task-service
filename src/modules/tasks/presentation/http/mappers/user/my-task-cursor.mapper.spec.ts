import { encodeCursor, ProblemException } from '@cadenway/nest-common';
import type { CursorValue } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import type { TaskPosition } from '../../../../application/models/query/task-position.model.js';
import { toMyTaskCursor, toMyTaskPosition } from './my-task-cursor.mapper.js';

const camille = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';
const taskId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
const createdAt = new Date('2026-11-18T10:15:30.123Z');

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
 * Forges a cursor of the open tasks of an account: the cursor is not signed.
 *
 * @param values - The `sort` array of the cursor.
 * @returns The cursor.
 */
function forged(values: readonly CursorValue[]): string {
  return encodeCursor(
    { sort: values, id: taskId },
    { collection: 'my-tasks', userId: camille, state: 'open' },
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

describe('the cursor of the tasks of an account', () => {
  it('gives the last page no cursor and the first page no position', () => {
    expect(toMyTaskCursor(null, camille, 'open')).toBeNull();
    expect(toMyTaskPosition(undefined, camille, 'open')).toBeNull();
  });

  it.each([
    ['open', '2026-11-08'],
    ['closed', null],
  ] as const)('decodes the cursor of the tab %s, with the due date %s', (state, due) => {
    const position: TaskPosition = { sortValue: due, createdAt, id: taskId };
    const cursor: string | null = toMyTaskCursor(position, camille.toUpperCase(), state);

    expect(toMyTaskPosition(cursor ?? undefined, camille, state)).toEqual(position);
  });

  it('refuses the cursor of the other tab, another account or another collection', () => {
    const cursor: string | undefined =
      toMyTaskCursor({ sortValue: null, createdAt, id: taskId }, camille, 'open') ?? undefined;
    const labels: string = encodeCursor(
      { sort: [null, createdAt.toISOString()], id: taskId },
      { collection: 'labels', search: null },
    );

    expectInvalidCursor(() => toMyTaskPosition(cursor, camille, 'closed'));
    expectInvalidCursor(() =>
      toMyTaskPosition(cursor, '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32', 'open'),
    );
    expectInvalidCursor(() => toMyTaskPosition(labels, camille, 'open'));
  });

  it('refuses a due date of the year 0000, that does not exist or that is not a date', () => {
    const instant: string = createdAt.toISOString();

    for (const due of ['0000-01-01', '2026-02-30', 'soon', 42]) {
      expectInvalidCursor(() => toMyTaskPosition(forged([due, instant]), camille, 'open'));
    }
    expectInvalidCursor(() => toMyTaskPosition(forged([instant]), camille, 'open'));
    expectInvalidCursor(() => toMyTaskPosition(forged([null, 'yesterday']), camille, 'open'));
  });
});
