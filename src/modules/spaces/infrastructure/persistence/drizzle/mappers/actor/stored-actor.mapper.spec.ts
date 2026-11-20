import { describe, expect, it } from 'vitest';

import { toStoredActor } from './stored-actor.mapper.js';

describe('toStoredActor: an actor stored as two columns', () => {
  it('reads each type of Actor with its id', () => {
    for (const type of ['user', 'automation', 'git', 'system'] as const) {
      expect(toStoredActor(type, 'id')).toEqual({ type, id: 'id' });
    }
  });

  it('reads null when either column is null, which the domain checks against the instant', () => {
    expect(toStoredActor(null, null)).toBeNull();
    expect(toStoredActor('user', null)).toBeNull();
    expect(toStoredActor(null, 'id')).toBeNull();
  });

  it('refuses a stored type outside those of Actor', () => {
    expect(() => toStoredActor('robot', 'r2d2')).toThrow(
      'A stored actor type is not user, automation, git or system.',
    );
  });
});
