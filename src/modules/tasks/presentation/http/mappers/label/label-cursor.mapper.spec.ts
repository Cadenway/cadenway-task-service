import { encodeCursor, ProblemException } from '@cadenway/nest-common';
import type { CursorValue } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import type { LabelPosition } from '../../../../application/models/label/label-position.model.js';
import { toLabelCursor, toLabelPosition } from './label-cursor.mapper.js';

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
 * Forges a cursor of the labels with a search: the cursor is not signed.
 *
 * @param values - The `sort` array of the cursor.
 * @param id - The id of the cursor.
 * @returns The cursor.
 */
function forged(values: readonly CursorValue[], id: string): string {
  return encodeCursor({ sort: values, id }, { collection: 'labels', search: null });
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

describe('the cursor of the labels', () => {
  const position: LabelPosition = { sortKey: 'authentification', labelKey: 'authentification' };

  it('gives the last page no cursor and the first page no position', () => {
    expect(toLabelCursor(null, undefined)).toBeNull();
    expect(toLabelPosition(undefined, undefined)).toBeNull();
  });

  it('decodes the cursor to the position it was built from, with or without a search', () => {
    expect(toLabelPosition(toLabelCursor(position, undefined) ?? undefined, undefined)).toEqual(
      position,
    );
    expect(toLabelPosition(toLabelCursor(position, 'auth') ?? undefined, 'auth')).toEqual(position);
  });

  it('keeps a name with an accent, an emoji or a code point outside the basic plane', () => {
    const accented: LabelPosition = { sortKey: 'écran 🚀', labelKey: 'écran 🚀' };

    expect(toLabelPosition(toLabelCursor(accented, undefined) ?? undefined, undefined)).toEqual(
      accented,
    );
  });

  it('refuses the cursor of another search or another collection', () => {
    const cursor: string | undefined = toLabelCursor(position, 'auth') ?? undefined;
    const subtasks: string = encodeCursor(
      { sort: ['authentification'], id: 'authentification' },
      { collection: 'subtasks', taskKey: 'CAD-482' },
    );

    expectInvalidCursor(() => toLabelPosition(cursor, undefined));
    expectInvalidCursor(() => toLabelPosition(cursor, 'Auth'));
    expectInvalidCursor(() => toLabelPosition(subtasks, undefined));
    expectInvalidCursor(() => toLabelPosition('not a cursor', undefined));
  });

  it('refuses a position that does not hold a folded name and a label key', () => {
    expectInvalidCursor(() => toLabelPosition(forged([], 'auth'), undefined));
    expectInvalidCursor(() => toLabelPosition(forged(['a', 'b'], 'auth'), undefined));
    expectInvalidCursor(() => toLabelPosition(forged([5], 'auth'), undefined));
    expectInvalidCursor(() => toLabelPosition(forged([null], 'auth'), undefined));
    expectInvalidCursor(() => toLabelPosition(forged(['a\u0000b'], 'auth'), undefined));
    expectInvalidCursor(() => toLabelPosition(forged(['a\ud800'], 'auth'), undefined));
    expectInvalidCursor(() => toLabelPosition(forged(['a'.repeat(129)], 'auth'), undefined));
    expectInvalidCursor(() => toLabelPosition(forged(['auth'], 'a\u0000b'), undefined));
    expectInvalidCursor(() => toLabelPosition(forged(['auth'], 'a'.repeat(257)), undefined));
  });

  it('counts the sort key in code points: 128 are accepted, also outside the basic plane, 129 are not', () => {
    const rockets: string = '🚀'.repeat(128);

    expect(toLabelPosition(forged([rockets], 'auth'), undefined)).toEqual({
      sortKey: rockets,
      labelKey: 'auth',
    });
    expectInvalidCursor(() => toLabelPosition(forged(['🚀'.repeat(129)], 'auth'), undefined));
  });

  it('keeps the cursor of a label of 32 × U+FDFA under the 2048 characters of the kit', () => {
    // U+FDFA folds to eighteen letters: 576 code points, cut to 128 by the statement.
    const labelKey: string = 'ﷺ'.repeat(32);
    const sortKey: string = 'صلى الله عليه وسلم'.repeat(32).slice(0, 128);
    const cursor: string | null = toLabelCursor({ sortKey, labelKey }, undefined);

    expect(cursor?.length).toBeLessThan(2048);
    expect(toLabelPosition(cursor ?? undefined, undefined)).toEqual({ sortKey, labelKey });
  });
});
