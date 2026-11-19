import { describe, expect, it } from 'vitest';

import { CREATED_AT, RESTORED_FROM_TRASH_AT } from '../../spaces.fixture.js';
import { positionInSidebarOf } from './space-position.policy.js';

describe('positionInSidebarOf: a space restored from the trash goes to the end of the sidebar', () => {
  it('places a space never restored by its creation', () => {
    expect(positionInSidebarOf({ createdAt: CREATED_AT, restoredAt: null })).toEqual(CREATED_AT);
  });

  it('places a restored space by its last restoration', () => {
    expect(
      positionInSidebarOf({ createdAt: CREATED_AT, restoredAt: RESTORED_FROM_TRASH_AT }),
    ).toEqual(RESTORED_FROM_TRASH_AT);
  });
});
