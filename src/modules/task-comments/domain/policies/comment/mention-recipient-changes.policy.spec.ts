import { describe, expect, it } from 'vitest';

import { mentionRecipientChanges } from './mention-recipient-changes.policy.js';

describe('mention recipient changes', () => {
  it('deduplicates repeated spans and compares account IDs case-insensitively', () => {
    const old = [
      { userId: 'CAMILLE', start: 0, end: 8 },
      { userId: 'camille', start: 9, end: 17 },
      { userId: 'INES', start: 18, end: 23 },
    ];
    const next = [
      { userId: 'Camille', start: 0, end: 8 },
      { userId: 'HUGO', start: 9, end: 14 },
      { userId: 'hugo', start: 15, end: 20 },
    ];
    expect(mentionRecipientChanges(old, next)).toEqual({ added: ['hugo'], removed: ['ines'] });
  });

  it('reports no change when only the span position changes', () => {
    expect(
      mentionRecipientChanges(
        [{ userId: 'camille', start: 0, end: 8 }],
        [{ userId: 'camille', start: 1, end: 9 }],
      ),
    ).toEqual({ added: [], removed: [] });
  });
});
