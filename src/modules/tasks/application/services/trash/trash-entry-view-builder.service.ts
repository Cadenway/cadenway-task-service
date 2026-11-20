import { subtaskCountOf } from '../../../domain/policies/trash/trash-entry.policy.js';
import { purgeAtOf } from '../../../domain/policies/trash/trash-retention.policy.js';
import type { TrashEntryRecord } from '../../models/trash/trash-entry-record.model.js';
import type { ListRefView } from '../../projections/archive/list-ref.projection.js';
import type { TrashEntryView } from '../../projections/trash/trash-entry.projection.js';

/**
 * Class TrashEntryViewBuilder
 *
 * @description
 * Builds the view of a trash entry (`TrashEntry`): its root as it reads now, the parent it had
 * as stored, the subtasks deleted with it (`task_count` less the root), the list as the caller
 * read it, and when it is erased (`purgeAtOf`, 30 days after `trashedAt`).
 */
export class TrashEntryViewBuilder {
  // #region Methods
  /**
   * Method build
   *
   * @description
   * Maps an entry and its list to the view.
   *
   * @param {TrashEntryRecord} entry - The entry.
   * @param {ListRefView} list - Its list, with its name and state as they are now.
   * @returns {TrashEntryView} The view.
   */
  public build(entry: TrashEntryRecord, list: ListRefView): TrashEntryView {
    return {
      id: entry.id,
      task: { key: entry.root.key, name: entry.root.name, status: entry.root.status },
      parentKey: entry.parentKey,
      subtaskCount: subtaskCountOf(entry.taskCount),
      list: { id: list.id, spaceId: list.spaceId, name: list.name, state: list.state },
      trashedAt: entry.trashedAt,
      trashedBy: { type: entry.trashedBy.type, id: entry.trashedBy.id },
      purgeAt: purgeAtOf(entry.trashedAt),
    };
  }
  // #endregion
}
