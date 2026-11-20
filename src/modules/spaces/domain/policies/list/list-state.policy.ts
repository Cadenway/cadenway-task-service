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
 * Whether a change of a space, or of one of its lists, is announced to the other services. The
 * clean-up of a member who left still changes a tombstone (owner, grants, versions); this is the
 * ONE rule every call site of the clean-up reads, by the kind of event:
 *
 * - `content` (`space.updated.v1`, the whole space): never for a tombstone, until it comes back
 *   from the trash ("`list.deleted.v1` and `space.deleted.v1` remove a list, or a space with all
 *   its lists" of `asyncapi/task-service.yaml`): the event would bring the space or list back in a
 *   consumer that dropped it, and the change comes with the whole space or list in
 *   `space.restored.v1` or `list.restored.v1`;
 * - `access` (`space.access-changed.v1`, `list.access-changed.v1`): always, tombstones included,
 *   as for a live space or list, so that a person whose grant was removed leaves the set of who
 *   reaches what of every consumer. The republish of a restoration cannot stand in for it: a
 *   `space.access-changed.v1` names one person at least (`changedUserIds`), so a restored space
 *   whose last grant was removed while it was deleted appends none.
 *
 * @param {'content' | 'access'} change - The kind of event of the change.
 * @param {Pick<SpaceState, 'deletedAt'>} space - The space, or the space of the list.
 * @param {Pick<TaskListState, 'archivedAt' | 'deletedAt'> | null} list - The list, or `null` for a
 * change of the space itself.
 * @returns {boolean} Whether the change emits its event.
 */
export function announcesChanges(
  change: 'content' | 'access',
  space: Pick<SpaceState, 'deletedAt'>,
  list: Pick<TaskListState, 'archivedAt' | 'deletedAt'> | null = null,
): boolean {
  if (change === 'access') {
    return true;
  }
  if (list === null) {
    return space.deletedAt === null;
  }
  return listStateOf(list, space) !== 'deleted';
}
