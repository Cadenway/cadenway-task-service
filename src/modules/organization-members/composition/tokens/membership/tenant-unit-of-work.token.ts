/**
 * Constant TENANT_UNIT_OF_WORK
 *
 * @description
 * Identifies the `MembershipsUnitOfWork` of the module, on the tenant runner: the member event
 * handlers join the transaction of the deduplicator, the queries join the one of their caller.
 *
 * @type {unique symbol}
 */
export const TENANT_UNIT_OF_WORK: unique symbol = Symbol('TenantMembershipsUnitOfWork');
