import type {
  ArchivedTask,
  ArchivedTaskPage as ArchivedTaskPageBody,
} from '@cadenway/contracts/types/internal/task-service';

import type { ArchivedTaskPage } from '../../../../application/projections/archive/archived-task-page.projection.js';
import type { ArchivedTaskView } from '../../../../application/projections/archive/archived-task.projection.js';
import { toTaskSummary } from '../task/task-summary.mapper.js';
import { toArchivesCursor } from './archive-cursor.mapper.js';

/**
 * Function toArchivedTask
 *
 * @description
 * Maps a root of the archives to the `ArchivedTask` of `openapi/internal/task-service.yaml`: its
 * summary, its list as it is now (`ListRef`, `state` `active` or `archived`), the subtasks archived
 * with it, the archive instant in ISO 8601 and its actor.
 *
 * @param {ArchivedTaskView} view - The root.
 * @returns {ArchivedTask} The item of the contract.
 */
function toArchivedTask(view: ArchivedTaskView): ArchivedTask {
  return {
    task: toTaskSummary(view.task),
    list: {
      id: view.list.id,
      spaceId: view.list.spaceId,
      name: view.list.name,
      state: view.list.state,
    },
    subtaskCount: view.subtaskCount,
    archivedAt: view.archivedAt.toISOString(),
    archivedBy: { type: view.archivedBy.type, id: view.archivedBy.id },
  };
}

/**
 * Function toArchivedTaskPage
 *
 * @description
 * Maps one page of the archived tasks to the `ArchivedTaskPage` of the contract, with the cursor
 * of the next page, `null` on the last one, and the total.
 *
 * @param {ArchivedTaskPage} page - The page.
 * @returns {ArchivedTaskPageBody} The page of the contract.
 */
export function toArchivedTaskPage(page: ArchivedTaskPage): ArchivedTaskPageBody {
  return {
    items: page.items.map(toArchivedTask),
    nextCursor: toArchivesCursor(page.next, 'archived-tasks'),
    total: page.total,
  };
}
