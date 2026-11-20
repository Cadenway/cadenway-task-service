import { describe, expect, it } from 'vitest';

import { InvalidCommentError } from '../../errors/comment/invalid-comment.error.js';
import { commentExcerpt, validateCommentText } from './comment-text.policy.js';

describe('comment text (P3b-2 decisions 2 and 3)', () => {
  it('counts Unicode code points without modifying Markdown', () => {
    expect(() => {
      validateCommentText('😀'.repeat(5000), []);
    }).not.toThrow();
    expect(() => {
      validateCommentText('😀'.repeat(5001), []);
    }).toThrow(InvalidCommentError);
    expect(commentExcerpt('😀'.repeat(241))).toBe('😀'.repeat(240));
  });

  it.each(['', '  \n', '\0'])('refuses blank or unstorable text', (body: string) => {
    expect(() => {
      validateCommentText(body, []);
    }).toThrow(InvalidCommentError);
  });

  it('uses code-point offsets and allows adjacent mentions', () => {
    expect(() => {
      validateCommentText('😀@Camille@Inès', [
        { userId: 'camille', start: 1, end: 9 },
        { userId: 'ines', start: 9, end: 14 },
      ]);
    }).not.toThrow();
  });

  it('enforces the limit of 20 mention spans', () => {
    const mentions = Array.from({ length: 21 }, (_, index) => ({
      userId: 'camille',
      start: index * 2,
      end: index * 2 + 2,
    }));
    expect(() => {
      validateCommentText('@C'.repeat(20), mentions.slice(0, 20));
    }).not.toThrow();
    expect(() => {
      validateCommentText('@C'.repeat(21), mentions);
    }).toThrow(InvalidCommentError);
  });

  it('refuses overlapping, empty and out-of-range spans', () => {
    for (const mentions of [
      [
        { userId: 'camille', start: 0, end: 4 },
        { userId: 'ines', start: 2, end: 5 },
      ],
      [{ userId: 'camille', start: 0, end: 1 }],
      [{ userId: 'camille', start: 0, end: 20 }],
    ]) {
      expect(() => {
        validateCommentText('@Camille', mentions);
      }).toThrow(InvalidCommentError);
    }
  });
});
