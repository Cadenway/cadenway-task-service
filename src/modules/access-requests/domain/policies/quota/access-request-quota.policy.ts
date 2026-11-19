import type { QuotaVerdict } from '../../value-objects/quota/quota-verdict.value-object.js';

/**
 * Constant ACCESS_REQUEST_LIMIT
 *
 * @description
 * How many requests for access a requester takes per organization within the last hour, stored or
 * not (decision 11 of P3b-1, "A person asks 10 times per hour at most, whatever became of the
 * requests" of `openapi/public/access.yaml`): counting the requests that were not stored keeps the
 * `429` from telling anything about a target.
 *
 * @type {number}
 */
export const ACCESS_REQUEST_LIMIT: number = 10;

/**
 * Constant ACCESS_REQUEST_WINDOW_MS
 *
 * @description
 * The window of the limit, one hour, in milliseconds.
 *
 * @type {number}
 */
export const ACCESS_REQUEST_WINDOW_MS: number = 3_600_000;

/**
 * Function quotaWindowStart
 *
 * @description
 * The instant the window of the limit starts: a request taken strictly after it counts, one taken
 * at it or before has left the hour.
 *
 * @param {Date} now - The instant of the request.
 * @returns {Date} One hour before it.
 */
export function quotaWindowStart(now: Date): Date {
  return new Date(now.getTime() - ACCESS_REQUEST_WINDOW_MS);
}

/**
 * Function checkRequestQuota
 *
 * @description
 * Decides whether a requester may ask once more: refused once the hour holds
 * `ACCESS_REQUEST_LIMIT` requests (the eleventh attempt is refused), and then the next one is
 * possible when the oldest of the `ACCESS_REQUEST_LIMIT` most recent requests leaves the hour
 * (`details.nextAvailableAt`), `retryAfterSeconds` later rounded up to a whole second, at least 1
 * (`Retry-After`). A refused attempt is not one of the requests counted: the caller records an
 * attempt only when this allows it.
 *
 * @param {readonly Date[]} attempts - When the requester asked, in any order; those that left the
 * hour are ignored.
 * @param {Date} now - The instant of the request, the clock of the transaction.
 * @returns {QuotaVerdict} Whether the request is taken.
 */
export function checkRequestQuota(attempts: readonly Date[], now: Date): QuotaVerdict {
  const start: number = quotaWindowStart(now).getTime();
  const counted: number[] = attempts
    .map((attempt: Date): number => attempt.getTime())
    .filter((instant: number): boolean => instant > start)
    .sort((left: number, right: number): number => right - left);
  const leaving: number | undefined = counted[ACCESS_REQUEST_LIMIT - 1];
  if (leaving === undefined) {
    return { allowed: true };
  }
  const nextAvailableAt: Date = new Date(leaving + ACCESS_REQUEST_WINDOW_MS);
  const retryAfterSeconds: number = Math.max(
    1,
    Math.ceil((nextAvailableAt.getTime() - now.getTime()) / 1000),
  );
  return { allowed: false, nextAvailableAt, retryAfterSeconds };
}
