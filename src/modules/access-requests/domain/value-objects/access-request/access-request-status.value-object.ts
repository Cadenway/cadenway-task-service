/**
 * Type AccessRequestStatus
 *
 * @description
 * Where a request for access stands (`state` of `AccessRequest`, `AccessRequestStateValue` of
 * `openapi/internal/task-service.yaml`): `pending` until someone who manages its target answers,
 * then `approved` or `refused`, once and for good.
 *
 * @type {'pending' | 'approved' | 'refused'}
 */
export type AccessRequestStatus = 'pending' | 'approved' | 'refused';

/**
 * Constant ACCESS_REQUEST_STATUSES
 *
 * @description
 * The three statuses, in the order a request goes through them.
 *
 * @type {readonly AccessRequestStatus[]}
 */
export const ACCESS_REQUEST_STATUSES: readonly AccessRequestStatus[] = Object.freeze([
  'pending',
  'approved',
  'refused',
]);

/**
 * Function isAccessRequestStatus
 *
 * @description
 * Whether a stored text is one of the three statuses.
 *
 * @param {string} value - The text.
 * @returns {boolean} Whether it is `pending`, `approved` or `refused`.
 */
export function isAccessRequestStatus(value: string): value is AccessRequestStatus {
  return (ACCESS_REQUEST_STATUSES as readonly string[]).includes(value);
}
