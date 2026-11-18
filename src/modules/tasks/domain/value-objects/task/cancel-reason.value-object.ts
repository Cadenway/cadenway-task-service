/**
 * Type CancelReason
 *
 * @description
 * Why a task was cancelled ("Motif d’annulation"), as `CancelReason` of
 * `openapi/internal/task-service.yaml:3428-3438` names it: `duplicate` ("Doublon"), `wontdo` ("Ne
 * sera pas fait"), `scope` ("Hors périmètre") or `obsolete` ("Obsolète"). A closed set, repeated
 * here because the domain cannot import `@cadenway/contracts`.
 *
 * @type {'duplicate' | 'wontdo' | 'scope' | 'obsolete'}
 */
export type CancelReason = 'duplicate' | 'wontdo' | 'scope' | 'obsolete';

/**
 * Constant CANCEL_REASONS
 *
 * @description
 * The four reasons in the order of `CANCEL_REASONS` of `@cadenway/contracts`.
 *
 * @type {readonly CancelReason[]}
 */
export const CANCEL_REASONS: readonly CancelReason[] = Object.freeze([
  'duplicate',
  'wontdo',
  'scope',
  'obsolete',
]);
