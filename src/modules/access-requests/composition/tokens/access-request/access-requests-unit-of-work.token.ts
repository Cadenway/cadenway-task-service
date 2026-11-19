/**
 * Constant ACCESS_REQUESTS_UNIT_OF_WORK
 *
 * @description
 * Identifies the `AccessRequestsUnitOfWork` of the module, bound to the tenant transaction runner
 * of the kit.
 *
 * @type {unique symbol}
 */
export const ACCESS_REQUESTS_UNIT_OF_WORK: unique symbol = Symbol('AccessRequestsUnitOfWork');
