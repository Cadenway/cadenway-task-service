import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { CLOSED_STATUS_KEYS } from '../../../../../domain/value-objects/task/status-category.value-object.js';
import { tasks } from '../../schemas/task/task.schema.js';

/**
 * Function closedStatuses
 *
 * @description
 * The list of the closed status keys (`CLOSED_STATUS_KEYS`) as SQL literals. The keys are
 * constants of the domain, never input.
 *
 * @returns {SQL} The comma-separated literals.
 */
function closedStatuses(): SQL {
  return sql.raw(CLOSED_STATUS_KEYS.map((key: string): string => `'${key}'`).join(', '));
}

/**
 * Function isClosed
 *
 * @description
 * The condition that a task is closed (`done` or `cancelled`).
 *
 * @returns {SQL} The condition.
 */
export function isClosed(): SQL {
  return sql`${tasks.status} in (${closedStatuses()})`;
}

/**
 * Function isNotClosed
 *
 * @description
 * The condition that a task is not closed (the categories `open` and `active`).
 *
 * @returns {SQL} The condition.
 */
export function isNotClosed(): SQL {
  return sql`${tasks.status} not in (${closedStatuses()})`;
}
