import { encodeCursor } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';
import { decodeCustomFieldCursor, encodeCustomFieldCursor } from './custom-field-cursor.mapper.js';

const id = '019a700a-1234-7567-89ab-cdef01234567';
const scope = { organizationId: id, spaceId: id, order: 'custom-fields-position-id' };

describe('custom field cursor', () => {
  it('round trips the last returned position', () => {
    const position = { position: 12, id };
    expect(
      decodeCustomFieldCursor(encodeCustomFieldCursor(position, scope) ?? undefined, scope),
    ).toEqual(position);
  });

  it('rejects another collection and malformed positions', () => {
    const cursor = encodeCursor({ sort: [3], id }, scope);
    expect(() => decodeCustomFieldCursor(cursor, { ...scope, spaceId: 'other' })).toThrow();
    for (const order of [-1, 30, 1.5, '1']) {
      expect(() =>
        decodeCustomFieldCursor(encodeCursor({ sort: [order], id }, scope), scope),
      ).toThrow();
    }
  });
});
