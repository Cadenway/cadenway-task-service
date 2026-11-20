import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { tasks } from '../../schemas/task/task.schema.js';

/**
 * Function untrashedTask
 *
 * @description
 * The one condition of a task that is not in the trash ("A task in the trash is left out of every
 * collection and count", "Entries" of `openapi/public/trash.yaml`), live or archived: part of
 * `liveTask`, and alone where an archived task counts (the archives, the subtasks of an archive,
 * the trees of a trash entry, the candidates of a deleted list, the locations other modules read).
 * A statement that reads `tasks` under an alias passes that alias.
 *
 * @param {{ readonly trashEntryId: AnyPgColumn }} [table] - `tasks`, or an alias of it; `tasks`
 * when left out.
 * @returns {SQL} The condition on that table.
 */
export function untrashedTask(table: { readonly trashEntryId: AnyPgColumn } = tasks): SQL {
  return sql`${table.trashEntryId} is null`;
}
