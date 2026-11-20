/**
 * Constant TRASH_SYSTEM_UNIT_OF_WORK
 *
 * @description
 * Identifies the `TrashSystemUnitOfWork` of the module, on the system runner: the read-only
 * cross-organization read of the organizations with trash to erase.
 *
 * @type {unique symbol}
 */
export const TRASH_SYSTEM_UNIT_OF_WORK: unique symbol = Symbol('TrashSystemUnitOfWork');
