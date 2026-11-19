import { ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import type { ListPosition } from '../../../../application/models/placement/list-position.model.js';
import { toSpaceOverviewCursor, toSpaceOverviewPosition } from './space-overview-cursor.mapper.js';

const spaceId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02';

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

describe('the cursor of the overview of a space', () => {
  const position: ListPosition = {
    position: new Date('2026-11-18T10:15:30.123Z'),
    id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
  };

  it('gives the last page no cursor and the first page no position', () => {
    expect(toSpaceOverviewCursor(null, spaceId)).toBeNull();
    expect(toSpaceOverviewPosition(undefined, spaceId)).toBeNull();
  });

  it('decodes the cursor to the position it was built from, whatever the case of the space', () => {
    const cursor: string | null = toSpaceOverviewCursor(position, spaceId.toUpperCase());

    expect(toSpaceOverviewPosition(cursor ?? undefined, spaceId)).toEqual(position);
  });

  it('refuses the cursor of another space, on the cursor parameter', () => {
    const cursor: string | null = toSpaceOverviewCursor(position, spaceId);

    const refusal: ProblemException = refusalOf(() =>
      toSpaceOverviewPosition(cursor ?? undefined, '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b03'),
    );

    expect(refusal.problem.status).toBe(400);
    expect(refusal.problem.code).toBe('request.invalid');
    expect(refusal.problem.details).toMatchObject({
      issues: [{ in: 'query', path: 'cursor', code: 'invalid_cursor' }],
    });
  });
});
