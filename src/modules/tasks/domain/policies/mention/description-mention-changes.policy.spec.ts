import { describe, expect, it } from 'vitest';
import { descriptionMentionChanges } from './description-mention-changes.policy.js';

describe('description mention recipient changes', () => {
  it('compares unique case-insensitive recipients and ignores position changes', () => {
    expect(
      descriptionMentionChanges(
        [
          { userId: 'ADA', start: 0, end: 4 },
          { userId: 'ada', start: 5, end: 9 },
          { userId: 'bea', start: 10, end: 14 },
        ],
        [
          { userId: 'Ada', start: 1, end: 5 },
          { userId: 'CY', start: 6, end: 9 },
          { userId: 'cy', start: 10, end: 13 },
        ],
      ),
    ).toEqual({ added: ['cy'], removed: ['bea'] });
  });
});
