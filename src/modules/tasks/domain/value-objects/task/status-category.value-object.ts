import type { StatusKey } from './status-key.value-object.js';

/**
 * Constant CLOSED_STATUS_KEYS
 *
 * @description
 * The statuses of the category `closed` ("Fermé"): `done` and `cancelled`
 * (`StatusCategory` of `openapi/internal/task-service.yaml:3036-3046`; `STATUS_CATEGORY_BY_KEY` of
 * `@cadenway/contracts`, which a spec checks it against). A task of any other key is open: of the
 * category `open` or `active`. The open and late counters and the "closed" tab of "Mes tâches"
 * rest on this set.
 *
 * @type {readonly StatusKey[]}
 */
export const CLOSED_STATUS_KEYS: readonly StatusKey[] = Object.freeze(['done', 'cancelled']);

/**
 * Function isClosedStatus
 *
 * @description
 * Whether a status is of the category `closed`.
 *
 * @param {StatusKey} status - The status.
 * @returns {boolean} `true` for `done` and `cancelled`.
 */
export function isClosedStatus(status: StatusKey): boolean {
  return CLOSED_STATUS_KEYS.includes(status);
}
