import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';

/**
 * Constant TRASH_RETENTION_DAYS
 *
 * @description
 * How long an entry stays in the trash before the daily purge erases it: 30 days ("Les tâches
 * supprimées arrivent ici. Vous pouvez les restaurer pendant 30 jours.", "Erasing" of
 * `openapi/public/trash.yaml`; decision 11 of the P3b-1 brief). The one constant of the retention.
 *
 * @type {number}
 */
export const TRASH_RETENTION_DAYS: number = 30;

/**
 * Constant RETENTION_MILLISECONDS
 *
 * @description
 * The retention as an exact duration: 30 days of 24 hours, whatever the time zone or a change of
 * the clocks, so that `purgeAt` is `trashedAt` plus exactly 30 × 86,400 seconds.
 *
 * @type {number}
 */
const RETENTION_MILLISECONDS: number = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Function requireInstant
 *
 * @description
 * Refuses an invalid instant.
 *
 * @param {Date} instant - The instant.
 * @returns {number} Its milliseconds since the epoch.
 * @throws {InvalidTaskError} When it is not a valid date.
 */
function requireInstant(instant: Date): number {
  const time: number = instant.getTime();
  if (Number.isNaN(time)) {
    throw new InvalidTaskError('the instant of a trash entry is a valid date');
  }
  return time;
}

/**
 * Function purgeAtOf
 *
 * @description
 * When an entry is erased for good unless restored: 30 days after it was deleted (`purgeAt` of
 * `TrashEntry`, "Effacée définitivement dans 28 jours", `openapi/public/trash.yaml`; `purgeAt` of
 * `task.trashed.v1`, `asyncapi/task-service.yaml`).
 *
 * @param {Date} trashedAt - When the entry was deleted, the transaction instant.
 * @returns {Date} Its purge instant.
 * @throws {InvalidTaskError} When the instant is invalid.
 */
export function purgeAtOf(trashedAt: Date): Date {
  return new Date(requireInstant(trashedAt) + RETENTION_MILLISECONDS);
}

/**
 * Function purgeDueBefore
 *
 * @description
 * The latest deletion instant whose entry is due at `now`: an entry is erased by the daily purge
 * once its `purgeAt` has passed (`purgeAtOf(trashedAt) <= now`), that is when `trashedAt` is at
 * or before `now` minus the retention. The statements of the purge compare `trashed_at` with it,
 * so the retention is defined here only.
 *
 * @param {Date} now - The instant of the purge, the transaction instant.
 * @returns {Date} The cut-off, inclusive.
 * @throws {InvalidTaskError} When the instant is invalid.
 */
export function purgeDueBefore(now: Date): Date {
  return new Date(requireInstant(now) - RETENTION_MILLISECONDS);
}
