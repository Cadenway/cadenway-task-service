import { encodeCursor } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { decodeMilestoneCursor, encodeMilestoneCursor } from './space-milestone-cursor.mapper.js';

const ID = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
const SPACE = { organizationId: ID, spaceId: ID, order: 'date-id' };

describe('space milestone cursor', () => {
  it.each(['0001-01-01', '2026-11-20', null])('round-trips date %s', (dueDate) => {
    const position = { dueDate, id: ID };
    const cursor = encodeMilestoneCursor(position, SPACE);
    expect(decodeMilestoneCursor(cursor ?? undefined, SPACE)).toEqual(position);
  });

  it('rejects a nonexistent calendar date and a cursor from another space', () => {
    const malformed = encodeCursor({ sort: ['2026-02-30'], id: ID }, SPACE);
    expect(() => decodeMilestoneCursor(malformed, SPACE)).toThrow();

    const valid = encodeCursor({ sort: [null], id: ID }, SPACE);
    expect(() => decodeMilestoneCursor(valid, { ...SPACE, spaceId: 'other' })).toThrow();
  });
});
