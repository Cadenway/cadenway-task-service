import { ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import type { ArchivePosition } from '../../../../application/models/archive/archive-position.model.js';
import { toArchivesCursor, toArchivesPosition } from './archive-cursor.mapper.js';

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

describe('the cursor of a tab of the archives', () => {
  const position: ArchivePosition = {
    archivedAt: new Date('2026-11-05T11:30:00.000Z'),
    id: '019a7200-0000-7000-8000-000000000482',
  };

  it('gives the last page no cursor and the first page no position', () => {
    expect(toArchivesCursor(null, 'archived-tasks')).toBeNull();
    expect(toArchivesPosition(undefined, 'archived-lists')).toBeNull();
  });

  it('decodes the cursor to the archive instant and the id it was built from', () => {
    const cursor: string | null = toArchivesCursor(position, 'archived-tasks');

    expect(toArchivesPosition(cursor ?? undefined, 'archived-tasks')).toEqual(position);
  });

  it('refuses the cursor of the other tab, and a forged one, on the cursor parameter', () => {
    const cursor: string | null = toArchivesCursor(position, 'archived-lists');

    for (const refusal of [
      refusalOf(() => toArchivesPosition(cursor ?? undefined, 'archived-tasks')),
      refusalOf(() => toArchivesPosition('not-a-cursor', 'archived-lists')),
    ]) {
      expect(refusal.problem).toMatchObject({ status: 400, code: 'request.invalid' });
      expect(refusal.problem.details).toMatchObject({
        issues: [{ in: 'query', path: 'cursor', code: 'invalid_cursor' }],
      });
    }
  });
});
