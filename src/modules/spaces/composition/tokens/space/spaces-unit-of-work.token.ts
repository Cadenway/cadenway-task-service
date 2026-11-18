/**
 * Constant SPACES_UNIT_OF_WORK
 *
 * @description
 * Identifies the `SpacesUnitOfWork` of the module, on the tenant runner: the routes join the
 * transaction of the idempotency interceptor when there is one, the handover of private spaces the
 * one the deduplicator of the kit opened for its event.
 *
 * @type {unique symbol}
 */
export const SPACES_UNIT_OF_WORK: unique symbol = Symbol('SpacesUnitOfWork');
