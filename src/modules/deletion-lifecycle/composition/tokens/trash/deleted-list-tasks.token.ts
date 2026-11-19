/**
 * Constant DELETED_LIST_TASKS
 *
 * @description
 * Identifies the `DeletedListTasks` port of the module, bound to the public
 * `TrashDeletedListTasks` of the tasks module.
 *
 * @type {unique symbol}
 */
export const DELETED_LIST_TASKS: unique symbol = Symbol('DeletedListTasks');
