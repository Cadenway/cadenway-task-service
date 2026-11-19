import { describe, expect, it } from 'vitest';

import {
  ACCESS_REQUEST_LIMIT,
  checkRequestQuota,
  quotaWindowStart,
} from './access-request-quota.policy.js';

/** The instant of the request, 12:00 on 8 November 2026. */
const NOW: Date = new Date('2026-11-08T12:00:00.000Z');

/**
 * An instant some minutes before `NOW`.
 *
 * @param minutes - How many minutes before.
 * @returns The instant.
 */
function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

describe('checkRequestQuota: 10 requests per requester within the last hour', () => {
  it('takes the first request of the hour', () => {
    expect(checkRequestQuota([], NOW)).toEqual({ allowed: true });
  });

  it('takes the tenth request while nine are counted', () => {
    const nine: Date[] = Array.from({ length: 9 }, (_, index: number) => minutesAgo(index + 1));

    expect(checkRequestQuota(nine, NOW)).toEqual({ allowed: true });
  });

  it('refuses the eleventh, until the oldest counted request leaves the hour', () => {
    const ten: Date[] = Array.from({ length: ACCESS_REQUEST_LIMIT }, (_, index: number) =>
      minutesAgo(index * 5 + 2),
    );

    expect(checkRequestQuota(ten, NOW)).toEqual({
      allowed: false,
      nextAvailableAt: new Date('2026-11-08T12:13:00.000Z'),
      retryAfterSeconds: 780,
    });
  });

  it('names the tenth most recent request when more were counted, in any order', () => {
    const twelve: Date[] = Array.from({ length: 12 }, (_, index: number) => minutesAgo(index + 1));

    const verdict = checkRequestQuota([...twelve].reverse(), NOW);

    expect(verdict).toMatchObject({ nextAvailableAt: new Date('2026-11-08T12:50:00.000Z') });
  });

  it('ignores the requests that left the hour, the one exactly an hour old included', () => {
    const old: Date[] = Array.from({ length: 10 }, (_, index: number) => minutesAgo(60 + index));

    expect(checkRequestQuota(old, NOW)).toEqual({ allowed: true });
  });

  it('counts a request taken a millisecond within the hour', () => {
    const ten: Date[] = [
      new Date(NOW.getTime() - 3_599_999),
      ...Array.from({ length: 9 }, (_, index: number) => minutesAgo(index)),
    ];

    expect(checkRequestQuota(ten, NOW)).toEqual({
      allowed: false,
      nextAvailableAt: new Date(NOW.getTime() + 1),
      retryAfterSeconds: 1,
    });
  });

  it('rounds the seconds to wait up to a whole second', () => {
    const ten: Date[] = Array.from({ length: 10 }, () => new Date(NOW.getTime() - 3_598_500));

    expect(checkRequestQuota(ten, NOW)).toMatchObject({ retryAfterSeconds: 2 });
  });
});

describe('quotaWindowStart: the hour before the request', () => {
  it('starts an hour before the instant of the request', () => {
    expect(quotaWindowStart(NOW)).toEqual(new Date('2026-11-08T11:00:00.000Z'));
  });
});
