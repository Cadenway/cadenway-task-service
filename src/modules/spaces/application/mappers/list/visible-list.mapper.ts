import { positionInSpaceOf } from '../../../domain/policies/list/list-position.policy.js';
import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { TaskListState } from '../../../domain/value-objects/list/task-list-state.value-object.js';
import type { VisibleList } from '../../projections/list/visible-list.projection.js';

/**
 * Function toVisibleList
 *
 * @description
 * Copies a stored list, its archive, its position in its space (`positionInSpaceOf`) and the role
 * of the member on it into its public projection, so that no type of the domain crosses the public
 * entry points. Shared by every operation that hands lists to another module.
 *
 * @param {TaskListState} state - The stored list.
 * @param {AccessRole} callerRole - The effective role of the member on the list.
 * @returns {VisibleList} The projection.
 */
export function toVisibleList(state: TaskListState, callerRole: AccessRole): VisibleList {
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
    position: positionInSpaceOf(state),
    version: state.version,
    organizationAccess: state.organizationAccess,
    archivedAt: state.archivedAt,
    archivedBy:
      state.archivedBy === null ? null : { type: state.archivedBy.type, id: state.archivedBy.id },
    callerRole,
  };
}
