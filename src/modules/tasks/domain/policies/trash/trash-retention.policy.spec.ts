import { describe, expect, it } from 'vitest';

import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { TRASHED_AT } from '../../tasks.fixture.js';
import { purgeAtOf, purgeDueBefore, TRASH_RETENTION_DAYS } from './trash-retention.policy.js';

describe('trash retention: an entry stays 30 days in the trash', () => {
  it('keeps an entry 30 days', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
  });

  it('erases CAD-452 30 days after its deletion, to the millisecond', () => {
    expect(purgeAtOf(new Date('2026-11-06T16:20:00.000Z'))).toEqual(
      new Date('2026-12-06T16:20:00.000Z'),
    );
    expect(purgeAtOf(new Date('2026-11-08T15:00:00.123Z'))).toEqual(
      new Date('2026-12-08T15:00:00.123Z'),
    );
  });

  it('counts 30 days of 24 hours across a change of the clocks', () => {
    expect(purgeAtOf(new Date('2026-10-10T09:00:00.000Z'))).toEqual(
      new Date('2026-11-09T09:00:00.000Z'),
    );
  });

  it('makes an entry due once its purge instant has passed, the cut-off included', () => {
    const now: Date = purgeAtOf(TRASHED_AT);

    expect(purgeDueBefore(now)).toEqual(TRASHED_AT);
    expect(purgeDueBefore(new Date(now.getTime() - 1)).getTime()).toBeLessThan(
      TRASHED_AT.getTime(),
    );
  });

  it('refuses an invalid instant', () => {
    expect(() => purgeAtOf(new Date(Number.NaN))).toThrow(InvalidTaskError);
    expect(() => purgeDueBefore(new Date(Number.NaN))).toThrow(InvalidTaskError);
  });
});
