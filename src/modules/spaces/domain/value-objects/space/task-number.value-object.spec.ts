import { describe, expect, it } from 'vitest';

import { MAX_TASK_NUMBER, isTaskNumber } from './task-number.value-object.js';

describe('isTaskNumber: a task key has a number of one to nine digits', () => {
  it('fixes the bound at nine digits', () => {
    expect(MAX_TASK_NUMBER).toBe(999_999_999);
  });

  it.each([1, 482, 999_999_999])('accepts %i', (value: number) => {
    expect(isTaskNumber(value)).toBe(true);
  });

  it.each([0, -1, 1_000_000_000, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses %s',
    (value: number) => {
      expect(isTaskNumber(value)).toBe(false);
    },
  );
});
