import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { tasks } from '../../schemas/task/task.schema.js';
import { untrashedTask } from './untrashed-task.mapper.js';

/**
 * Function liveTask
 *
 * @description
 * The one condition of a live task, in every statement that reads a collection or a count of
 * tasks: not archived and not in the trash (`untrashedTask`) ("An archived task is left out of every collection
 * and count", "Tasks" of `openapi/public/archives.yaml`; "A task in the trash is left out of every
 * collection and count", "Entries" of `openapi/public/trash.yaml`). The tasks of a list, its groups
 * and counters, the overview, "Accueil", "Mes tâches", the labels, the activity of a list, the
 * live subtree and child count of a write, and the standing of the parent of a restored root all
 * use it; the subtask reads use the same-archive rule instead (`sameArchiveAsParent`). A statement
 * that reads `tasks` under an alias (the recursive step of the subtree) passes that alias, so no
 * statement spells the condition by hand.
 *
 * @param {{ readonly archivedAt: AnyPgColumn; readonly trashEntryId: AnyPgColumn }} [table] -
 * `tasks`, or an alias of it; `tasks` when left out.
 * @returns {SQL} The condition on that table.
 */
export function liveTask(
  table: { readonly archivedAt: AnyPgColumn; readonly trashEntryId: AnyPgColumn } = tasks,
): SQL {
  return sql`(${table.archivedAt} is null and ${untrashedTask(table)})`;
}
