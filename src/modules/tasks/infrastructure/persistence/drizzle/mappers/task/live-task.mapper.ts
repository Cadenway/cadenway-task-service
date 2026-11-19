import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { tasks } from '../../schemas/task/task.schema.js';

/**
 * Function liveTask
 *
 * @description
 * The one condition of a live task, in every statement that reads a collection or a count of
 * tasks: not archived ("An archived task is left out of every collection and count", "Tasks" of
 * `openapi/public/archives.yaml`). The trash of a later version narrows it here, once. The tasks
 * of a list, its groups and counters, the overview, "Accueil", "Mes tâches", the labels, the
 * activity of a list, and the live subtree and child count of a write all use it; the subtask
 * reads use the same-archive rule instead (`sameArchiveAsParent`).
 *
 * @returns {SQL} The condition on `tasks`.
 */
export function liveTask(): SQL {
  return sql`${tasks.archivedAt} is null`;
}
