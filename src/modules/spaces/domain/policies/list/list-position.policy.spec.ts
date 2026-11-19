import { describe, expect, it } from 'vitest';

import { CREATED_AT } from '../../spaces.fixture.js';
import { positionInSpaceOf } from './list-position.policy.js';

describe('positionInSpaceOf: a restored list goes to the end of its space', () => {
  it('places a list that never came back from the archives by its creation', () => {
    expect(positionInSpaceOf({ createdAt: CREATED_AT, restoredAt: null })).toEqual(CREATED_AT);
  });

  it('places a restored list by its restoration', () => {
    const restoredAt: Date = new Date('2026-11-08T17:00:00Z');

    expect(positionInSpaceOf({ createdAt: CREATED_AT, restoredAt })).toEqual(restoredAt);
  });
});
