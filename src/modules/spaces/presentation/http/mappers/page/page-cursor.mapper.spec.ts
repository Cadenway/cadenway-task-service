import { encodeCursor, ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import type { PagePosition } from '../../../../application/models/page/page-position.model.js';
import { toListsCursor, toListsPosition } from '../list/list-cursor.mapper.js';
import { toSpacesCursor, toSpacesPosition } from '../space/space-cursor.mapper.js';

describe('the cursors of the spaces and the lists', () => {
  const position: PagePosition = {
    createdAt: new Date('2026-11-18T10:15:30.123Z'),
    id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
  };
  const spaceId: string = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02';

  /**
   * Runs a decoding and returns the problem it throws.
   *
   * @param {() => unknown} decode - The decoding.
   * @returns {ProblemException} The problem.
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

  it('gives the last page no cursor and the first page no position', () => {
    expect(toSpacesCursor(null)).toBeNull();
    expect(toSpacesPosition(undefined)).toBeNull();
    expect(toListsCursor(null, spaceId)).toBeNull();
    expect(toListsPosition(undefined, spaceId)).toBeNull();
  });

  it('decodes the cursor of a page of spaces to the position it was built from', () => {
    const cursor: string | null = toSpacesCursor(position);

    expect(cursor).not.toBeNull();
    expect(toSpacesPosition(cursor ?? undefined)).toEqual(position);
  });

  it('decodes the cursor of the lists of a space whatever the case of its id', () => {
    const cursor: string | null = toListsCursor(position, spaceId.toUpperCase());

    expect(toListsPosition(cursor ?? undefined, spaceId)).toEqual(position);
  });

  it('refuses the cursor of the spaces for the lists, and the cursor of another space', () => {
    const spaces: string | null = toSpacesCursor(position);
    const lists: string | null = toListsCursor(position, spaceId);

    expect(refusalOf(() => toListsPosition(spaces ?? undefined, spaceId)).problem.code).toBe(
      'request.invalid',
    );
    expect(refusalOf(() => toSpacesPosition(lists ?? undefined)).problem.status).toBe(400);
    expect(
      refusalOf(() => toListsPosition(lists ?? undefined, '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03'))
        .problem.code,
    ).toBe('request.invalid');
  });

  it('refuses a cursor that is not a creation instant and a UUID, without quoting it', () => {
    const filters: { readonly collection: 'spaces' } = { collection: 'spaces' };
    const forged: readonly string[] = [
      encodeCursor({ sort: ['not a date'], id: position.id }, filters),
      encodeCursor({ sort: ['2026-11-18'], id: position.id }, filters),
      encodeCursor({ sort: ['12026-11-18T10:15:30.123Z'], id: position.id }, filters),
      encodeCursor({ sort: [42], id: position.id }, filters),
      encodeCursor({ sort: [], id: position.id }, filters),
      encodeCursor({ sort: [position.createdAt.toISOString(), 'x'], id: position.id }, filters),
      encodeCursor({ sort: [position.createdAt.toISOString()], id: "1' OR '1'='1" }, filters),
    ];

    for (const cursor of forged) {
      const refusal: ProblemException = refusalOf(() => toSpacesPosition(cursor));

      expect(refusal.problem.status).toBe(400);
      expect(refusal.problem.code).toBe('request.invalid');
      expect(JSON.stringify(refusal.problem)).not.toContain('OR');
    }
  });

  it('refuses a malformed cursor', () => {
    expect(refusalOf(() => toSpacesPosition('%%%')).problem.code).toBe('request.invalid');
  });
});
