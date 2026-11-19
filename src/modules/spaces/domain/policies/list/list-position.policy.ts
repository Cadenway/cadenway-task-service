import type { TaskListState } from '../../value-objects/list/task-list-state.value-object.js';

/**
 * Function positionInSpaceOf
 *
 * @description
 * The instant that places a list among the lists of its space, the order of the sidebar: when it
 * last came back from the archives, or else when it was created ("Restoring a list puts it back
 * at the end of its space" of `openapi/public/archives.yaml`, decision 6 of P3b-1). Lists are
 * ordered by this instant, then by id; the query of the lists of a space orders them by
 * `coalesce(restored_at, created_at)`, the same value.
 *
 * @param {Pick<TaskListState, 'createdAt' | 'restoredAt'>} list - The list.
 * @returns {Date} Its position in its space.
 */
export function positionInSpaceOf(list: Pick<TaskListState, 'createdAt' | 'restoredAt'>): Date {
  return list.restoredAt ?? list.createdAt;
}
