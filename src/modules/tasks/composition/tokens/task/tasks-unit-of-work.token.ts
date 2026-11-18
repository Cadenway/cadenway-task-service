/**
 * Constant TASKS_UNIT_OF_WORK
 *
 * @description
 * Identifies the `TasksUnitOfWork` of the module, on the tenant runner: the routes join the
 * transaction of the idempotency interceptor when there is one (the three creations), the
 * unassignment of a removed member the one the deduplicator of the kit opened for its event.
 *
 * @type {unique symbol}
 */
export const TASKS_UNIT_OF_WORK: unique symbol = Symbol('TasksUnitOfWork');
