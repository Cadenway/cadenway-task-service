import { encodeCursor } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { toFavoriteCursor, toFavoritePosition } from './favorite-cursor.mapper.js';

const owner = {
  organizationId: '019a7200-0000-7000-8000-000000000001',
  actorUserId: '019a7200-0000-7000-8000-000000000002',
};
const position = {
  id: '019a7200-0000-7000-8000-000000000003',
  createdAt: new Date('2026-11-20T06:10:02.321Z'),
};

describe('favorites cursor', () => {
  it('roundtrips the immutable position only for the actor and tenant that received it', () => {
    const cursor = toFavoriteCursor(owner, position) ?? '';
    expect(toFavoritePosition(owner, cursor)).toEqual(position);
    expect(() => toFavoritePosition({ ...owner, actorUserId: position.id }, cursor)).toThrow();
    expect(() => toFavoritePosition({ ...owner, organizationId: position.id }, cursor)).toThrow();
  });

  it('refuses a shape-correct cursor with a timestamp PostgreSQL cannot use', () => {
    const cursor = encodeCursor({ id: position.id, sort: ['+010000-01-01T00:00:00.000Z'] }, [
      'favorites',
      owner.organizationId,
      owner.actorUserId,
    ]);
    expect(() => toFavoritePosition(owner, cursor)).toThrow();
  });
});
