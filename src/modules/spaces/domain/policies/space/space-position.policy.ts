import type { SpaceState } from '../../value-objects/space/space-state.value-object.js';

/**
 * Function positionInSidebarOf
 *
 * @description
 * The instant that places a space in the sidebar and in every collection of spaces: when it last
 * came back from the trash, or else when it was created ("Restoring one of them brings back its
 * list and the space, at the end of the sidebar" of `openapi/public/spaces.yaml`,
 * `space.restored.v1` of `asyncapi/task-service.yaml`). Spaces are ordered by this instant, then
 * by id; the queries order them by `coalesce(restored_at, created_at)`, the same value.
 *
 * @param {Pick<SpaceState, 'createdAt' | 'restoredAt'>} space - The space.
 * @returns {Date} Its position in the sidebar.
 */
export function positionInSidebarOf(space: Pick<SpaceState, 'createdAt' | 'restoredAt'>): Date {
  return space.restoredAt ?? space.createdAt;
}
