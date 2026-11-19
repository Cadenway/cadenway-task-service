/**
 * Constant ACCESS_TARGETS
 *
 * @description
 * Identifies the `AccessTargets` port of the module, bound to the public operations
 * `FindAccessTarget`, `ListManagedAccessTargets` and `GrantRequestedAccess` of the spaces module.
 *
 * @type {unique symbol}
 */
export const ACCESS_TARGETS: unique symbol = Symbol('AccessTargets');
