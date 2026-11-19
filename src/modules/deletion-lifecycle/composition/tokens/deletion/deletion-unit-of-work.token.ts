/**
 * Constant DELETION_UNIT_OF_WORK
 *
 * @description
 * Identifies the `DeletionUnitOfWork` port of the module, bound to the tenant transaction runner
 * of the kit.
 *
 * @type {unique symbol}
 */
export const DELETION_UNIT_OF_WORK: unique symbol = Symbol('DeletionUnitOfWork');
