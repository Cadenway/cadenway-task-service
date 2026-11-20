import { encodeCursor } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import {
  decodeParticipantCursor,
  encodeParticipantCursor,
} from './task-participants-cursor.mapper.js';

/** A participant page in Atelier Nord. */
const target = { organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f', taskKey: 'CAD-482' };

/** An eligible member's account ID, in the order used by PostgreSQL. */
const account = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

describe('task participant cursor', () => {
  it('round-trips position and handles the ends of the collection', () => {
    const raw = encodeParticipantCursor(account, target);
    expect(decodeParticipantCursor(raw ?? undefined, target)).toBe(account);
    expect(decodeParticipantCursor(undefined, target)).toBeNull();
    expect(encodeParticipantCursor(null, target)).toBeNull();
  });

  it('refuses another task, tenant or a malformed SQL position', () => {
    const raw = encodeParticipantCursor(account, target) ?? undefined;
    expect(() => decodeParticipantCursor(raw, { ...target, taskKey: 'CAD-483' })).toThrow();
    expect(() => decodeParticipantCursor(raw, { ...target, organizationId: account })).toThrow();
    const wrongId = encodeCursor(
      { id: 'malformed', sort: ['malformed'] },
      { collection: 'task-participants', ...target },
    );
    expect(() => decodeParticipantCursor(wrongId, target)).toThrow();
  });
});
