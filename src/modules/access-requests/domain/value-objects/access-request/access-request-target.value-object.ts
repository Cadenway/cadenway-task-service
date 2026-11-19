/**
 * Type AccessRequestTarget
 *
 * @description
 * What a request for access asks for (`AccessRequestTargetValue` of
 * `openapi/internal/task-service.yaml`): a space by its id, a list by its id, or a task by its key,
 * as the link the requester followed names it ("Demander l’accès", decision 4 of P3b-1).
 *
 * @type {'space' | 'list' | 'task'}
 */
export type AccessRequestTarget = 'space' | 'list' | 'task';

/**
 * Constant ACCESS_REQUEST_TARGETS
 *
 * @description
 * The three targets, in the order of the contract.
 *
 * @type {readonly AccessRequestTarget[]}
 */
export const ACCESS_REQUEST_TARGETS: readonly AccessRequestTarget[] = Object.freeze([
  'space',
  'list',
  'task',
]);

/**
 * Function isAccessRequestTarget
 *
 * @description
 * Whether a stored text is one of the three targets.
 *
 * @param {string} value - The text.
 * @returns {boolean} Whether it is `space`, `list` or `task`.
 */
export function isAccessRequestTarget(value: string): value is AccessRequestTarget {
  return (ACCESS_REQUEST_TARGETS as readonly string[]).includes(value);
}
