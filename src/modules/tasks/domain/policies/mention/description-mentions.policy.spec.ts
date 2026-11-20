import { describe, expect, it } from 'vitest';
import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { validateDescriptionMentions } from './description-mentions.policy.js';

describe('description mention spans', () => {
  it('uses code points and accepts non-overlapping spans in any order', () => {
    expect(() => {
      validateDescriptionMentions('😀 @Ada @Bea', [
        { userId: 'bea', start: 7, end: 11 },
        { userId: 'ada', start: 2, end: 6 },
      ]);
    }).not.toThrow();
    expect(() => {
      validateDescriptionMentions(null, []);
    }).not.toThrow();
  });

  it('refuses missing text, overlap, invalid offsets and spans without a token', () => {
    for (const [text, spans] of [
      [null, [{ userId: 'ada', start: 0, end: 4 }]],
      [
        '@Ada',
        [
          { userId: 'ada', start: 0, end: 4 },
          { userId: 'bea', start: 0, end: 4 },
        ],
      ],
      ['😀 @Ada', [{ userId: 'ada', start: 1, end: 6 }]],
      ['@ ', [{ userId: 'ada', start: 0, end: 2 }]],
      ['@Ada', [{ userId: 'ada', start: -1, end: 4 }]],
      ['@Ada', [{ userId: 'ada', start: 0, end: 5 }]],
    ] as const)
      expect(() => {
        validateDescriptionMentions(text, spans);
      }).toThrow(InvalidTaskError);
  });

  it('refuses more than 20 spans', () => {
    expect(() => {
      validateDescriptionMentions(
        '@x '.repeat(21),
        Array.from({ length: 21 }, (_, index) => ({
          userId: 'ada',
          start: index * 3,
          end: index * 3 + 2,
        })),
      );
    }).toThrow(InvalidTaskError);
  });
});
