import type { Viewer } from '../../value-objects/member/viewer.value-object.js';
import type { SpaceState } from '../../value-objects/space/space-state.value-object.js';

/**
 * Function canSeeSpace
 *
 * @description
 * Whether a member sees a space, and so its lists and tasks (decision 3 of the P3a plan, "Who
 * sees a space" of `openapi/public/spaces.yaml`): a guest sees no space in this version; a space
 * of the whole organization is seen by every other member; a private space by its owner only, not
 * even by the owner or the admins of the organization. A space the caller does not see answers as
 * an unknown one does, and is left out of every collection and count. Any visibility other than
 * `organization` is treated as private, so an unexpected value fails closed.
 *
 * @param {Pick<SpaceState, 'visibility' | 'ownerUserId'>} space - The space.
 * @param {Viewer} viewer - The member who asks.
 * @returns {boolean} Whether the member sees the space.
 */
export function canSeeSpace(
  space: Pick<SpaceState, 'visibility' | 'ownerUserId'>,
  viewer: Viewer,
): boolean {
  if (viewer.role === 'guest') {
    return false;
  }
  return space.visibility === 'organization' || space.ownerUserId === viewer.userId;
}

/**
 * Function canCreateSpace
 *
 * @description
 * Whether a member creates spaces (decision 3 of the P3a plan, "Who changes what" of
 * `openapi/public/spaces.yaml`): every member but the guests; a guest gets
 * `403 organization.role-forbidden`.
 *
 * @param {Viewer} viewer - The member who asks.
 * @returns {boolean} Whether the member may create a space.
 */
export function canCreateSpace(viewer: Viewer): boolean {
  return viewer.role !== 'guest';
}

/**
 * Function canChangeVisibility
 *
 * @description
 * Whether a member changes the visibility of a space (decision 3 of the P3a plan, "Who changes
 * what" of `openapi/public/spaces.yaml`, `403 space.visibility-forbidden`): the owner of the space,
 * or the owner or an admin of the organization. The member must also see the space, which the
 * caller checks first with `canSeeSpace`; a guest, who sees no space, never changes one.
 *
 * @param {Pick<SpaceState, 'ownerUserId'>} space - The space.
 * @param {Viewer} viewer - The member who asks.
 * @returns {boolean} Whether the member may change the visibility of the space.
 */
export function canChangeVisibility(
  space: Pick<SpaceState, 'ownerUserId'>,
  viewer: Viewer,
): boolean {
  if (viewer.role === 'guest') {
    return false;
  }
  return space.ownerUserId === viewer.userId || viewer.role === 'owner' || viewer.role === 'admin';
}
