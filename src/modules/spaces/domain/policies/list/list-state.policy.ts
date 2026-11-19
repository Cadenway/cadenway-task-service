import type { ListStateValue } from '../../value-objects/list/list-state-value.value-object.js';
import type { TaskListState } from '../../value-objects/list/task-list-state.value-object.js';
import type { SpaceState } from '../../value-objects/space/space-state.value-object.js';

/**
 * Function listStateOf
 *
 * @description
 * Where a list stands (`ListStateValue` of `openapi/internal/task-service.yaml`): `deleted` when
 * the list or its space is deleted ("A deleted space disappears at once with its lists, archived
 * ones included" of `openapi/public/spaces.yaml`), whether archived or not; otherwise `archived`
 * when it is archived; otherwise `active`.
 *
 * @param {Pick<TaskListState, 'archivedAt' | 'deletedAt'>} list - The list.
 * @param {Pick<SpaceState, 'deletedAt'>} space - Its space.
 * @returns {ListStateValue} Its state.
 */
export function listStateOf(
  list: Pick<TaskListState, 'archivedAt' | 'deletedAt'>,
  space: Pick<SpaceState, 'deletedAt'>,
): ListStateValue {
  if (list.deletedAt !== null || space.deletedAt !== null) {
    return 'deleted';
  }
  return list.archivedAt === null ? 'active' : 'archived';
}

/**
 * Function announcesChanges
 *
 * @description
 * Whether a change of a space, or of one of its lists, is announced to the other services: never
 * for a tombstone, until it comes back from the trash ("`list.deleted.v1` and `space.deleted.v1`
 * remove a list, or a space with all its lists" of `asyncapi/task-service.yaml`: a consumer
 * dropped them, as it drops a task in the trash, which emits nothing). The clean-up of a member
 * who left still changes a tombstone (owner, grants, versions), silently; its event comes with the
 * whole space or list in `space.restored.v1` or `list.restored.v1`. The ONE rule every call site
 * of the clean-up reads.
 *
 * @param {Pick<SpaceState, 'deletedAt'>} space - The space, or the space of the list.
 * @param {Pick<TaskListState, 'archivedAt' | 'deletedAt'> | null} list - The list, or `null` for a
 * change of the space itself.
 * @returns {boolean} Whether the change emits its event.
 */
export function announcesChanges(
  space: Pick<SpaceState, 'deletedAt'>,
  list: Pick<TaskListState, 'archivedAt' | 'deletedAt'> | null = null,
): boolean {
  if (list === null) {
    return space.deletedAt === null;
  }
  return listStateOf(list, space) !== 'deleted';
}
