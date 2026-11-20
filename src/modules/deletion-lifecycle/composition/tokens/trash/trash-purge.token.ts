/**
 * Constant TRASH_PURGE
 *
 * @description
 * Identifies the `TrashPurge` port of the module, bound to the public `PurgeTrashBatch` of the
 * tasks module.
 *
 * @type {unique symbol}
 */
export const TRASH_PURGE: unique symbol = Symbol('TrashPurge');
