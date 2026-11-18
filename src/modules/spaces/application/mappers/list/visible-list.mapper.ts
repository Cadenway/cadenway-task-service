import type { TaskListState } from '../../../domain/value-objects/list/task-list-state.value-object.js';
import type { VisibleList } from '../../projections/list/visible-list.projection.js';

/**
 * Function toVisibleList
 *
 * @description
 * Copies a stored list into its public projection, so that no type of the domain crosses the
 * public entry points. Shared by every operation that hands lists to another module.
 *
 * @param {TaskListState} state - The stored list.
 * @returns {VisibleList} The projection.
 */
export function toVisibleList(state: TaskListState): VisibleList {
  return {
    id: state.id,
    spaceId: state.spaceId,
    name: state.name,
    icon: state.icon,
    color: state.color,
    sprint:
      state.sprint === null
        ? null
        : {
            startDate: state.sprint.startDate,
            endDate: state.sprint.endDate,
            goal: state.sprint.goal,
          },
    createdAt: state.createdAt,
    version: state.version,
  };
}
