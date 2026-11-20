import type { TrashEntry } from '@cadenway/contracts/types/internal/task-service';

import type { TrashEntryView } from '../../../../application/projections/trash/trash-entry.projection.js';
import { toTaskRef } from '../task/task-reference.mapper.js';

/**
 * Function toTrashEntry
 *
 * @description
 * Maps an entry of the trash to `TrashEntry` of the contract: the root as `TaskRef`, the stored
 * parent, the subtasks, the list as `ListRef` (`active`, `archived` or `deleted`), the instants as
 * ISO 8601 texts and the actor.
 *
 * @param {TrashEntryView} view - The entry.
 * @returns {TrashEntry} The body.
 */
export function toTrashEntry(view: TrashEntryView): TrashEntry {
  return {
    id: view.id,
    task: toTaskRef(view.task),
    parentKey: view.parentKey,
    subtaskCount: view.subtaskCount,
    list: {
      id: view.list.id,
      spaceId: view.list.spaceId,
      name: view.list.name,
      state: view.list.state,
    },
    trashedAt: view.trashedAt.toISOString(),
    trashedBy: { type: view.trashedBy.type, id: view.trashedBy.id },
    purgeAt: view.purgeAt.toISOString(),
  };
}
