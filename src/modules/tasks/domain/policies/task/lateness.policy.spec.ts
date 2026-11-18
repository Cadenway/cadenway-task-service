import { describe, expect, it } from 'vitest';

import { isLate } from './lateness.policy.js';

describe('isLate: a task is late when it is not closed and due strictly before today', () => {
  it('is late the day after its due date', () => {
    expect(isLate('progress', '2026-11-07', '2026-11-08')).toBe(true);
  });

  it('is not late on its due date', () => {
    expect(isLate('progress', '2026-11-08', '2026-11-08')).toBe(false);
  });

  it('is not late before its due date', () => {
    expect(isLate('todo', '2026-11-09', '2026-11-08')).toBe(false);
  });

  it('is never late without a due date', () => {
    expect(isLate('todo', null, '2026-11-08')).toBe(false);
  });

  it.each(['done', 'cancelled'] as const)(
    'is not late when it is %s, whatever its due date',
    (status) => {
      expect(isLate(status, '2026-10-01', '2026-11-08')).toBe(false);
    },
  );
});
