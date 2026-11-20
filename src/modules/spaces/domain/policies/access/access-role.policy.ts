import { rankOf } from '../../value-objects/access/access-role.value-object.js';
import type { AccessRole } from '../../value-objects/access/access-role.value-object.js';
import type { ListGrants } from '../../value-objects/access/list-grants.value-object.js';
import type { TaskListState } from '../../value-objects/list/task-list-state.value-object.js';
import type { Viewer } from '../../value-objects/member/viewer.value-object.js';
import type { SpaceState } from '../../value-objects/space/space-state.value-object.js';

/**
 * Type AccessSpace
 *
 * @description
 * What the access rules read of a space: its visibility, its owner, whether it is deleted and
 * whether it awaits an owner.
 */
export type AccessSpace = Pick<SpaceState, 'visibility' | 'ownerUserId' | 'deletedAt'> &
  Partial<Pick<SpaceState, 'awaitingOwner'>>;

/**
 * Function highestRole
 *
 * @description
 * The highest of some roles (`edit` over `comment` over `view`), `null` when none is given:
 * the effective role is the highest of what each source gives (decision 2 of P3b-1).
 *
 * @param {readonly (AccessRole | null)[]} roles - The roles each source gives, `null` for none.
 * @returns {AccessRole | null} The highest, or `null`.
 */
export function highestRole(roles: readonly (AccessRole | null)[]): AccessRole | null {
  let best: AccessRole | null = null;
  for (const role of roles) {
    if (rankOf(role) > rankOf(best)) {
      best = role;
    }
  }
  return best;
}

/**
 * Function spaceRoleOf
 *
 * @description
 * The role of a member on a space itself (`callerRole` of `Space`, "Access" of
 * `openapi/public/spaces.yaml`): the highest of `edit` for the owner of the space, `edit` for every
 * owner, admin and member of the organization in a space `organization` (the P3a rule), and the
 * grant of the space. A guest has none: a space grant held as a member gives nothing while the
 * person is a guest (decision beyond the brief of the contract), and the rule of the organization
 * never reaches guests. A space awaiting an owner gives nobody a role (fail closed, P3a), nor does a
 * deleted space, which answers as an unknown one ("Who sees a space" of
 * `openapi/public/spaces.yaml`). Any visibility other than `organization` reads as private, so an
 * unexpected value fails closed.
 *
 * @param {AccessSpace} space - The space.
 * @param {Viewer} viewer - The member who asks.
 * @param {AccessRole | null} spaceGrant - The grant of the viewer on the space, `null` for none.
 * @returns {AccessRole | null} The role, `null` when the space gives the viewer none (they may
 * still see it through the grants of some of its lists).
 */
export function spaceRoleOf(
  space: AccessSpace,
  viewer: Viewer,
  spaceGrant: AccessRole | null,
): AccessRole | null {
  if (space.awaitingOwner === true || space.deletedAt !== null || viewer.role === 'guest') {
    return null;
  }
  return highestRole([
    space.ownerUserId === viewer.userId ? 'edit' : null,
    space.visibility === 'organization' ? 'edit' : null,
    spaceGrant,
  ]);
}

/**
 * Function listRoleOf
 *
 * @description
 * The effective role of a member on a list (`callerRole` of `TaskList`, decision 2 of P3b-1 as
 * the contract fixed it): the role of `listRoleAsIfNotDeletedOf`, and none on a deleted list or a
 * list of a deleted space, which answers as an unknown one ("Who sees a list" and "Deletion" of
 * `openapi/public/lists.yaml`: fail closed on a tombstone). `null`: the member does not see the
 * list, which answers as an unknown one.
 *
 * @param {AccessSpace} space - The space of the list.
 * @param {Pick<TaskListState, 'organizationAccess' | 'deletedAt'>} list - The list.
 * @param {Viewer} viewer - The member who asks.
 * @param {ListGrants} grants - The grants of the viewer on the space and on the list.
 * @returns {AccessRole | null} The role, or `null` when the viewer does not see the list.
 */
export function listRoleOf(
  space: AccessSpace,
  list: Pick<TaskListState, 'organizationAccess' | 'deletedAt'>,
  viewer: Viewer,
  grants: ListGrants,
): AccessRole | null {
  if (space.deletedAt !== null || list.deletedAt !== null) {
    return null;
  }
  return listRoleAsIfNotDeletedOf(space, list, viewer, grants);
}

/** The implicit role of non-guests from organization access, independent of explicit grants. */
export function organizationListRoleOf(
  space: AccessSpace,
  list: Pick<TaskListState, 'organizationAccess'>,
): AccessRole | null {
  return space.visibility === 'organization' && list.organizationAccess ? 'edit' : null;
}

/**
 * Function listRoleAsIfNotDeletedOf
 *
 * @description
 * The role a member has on a list, or would have if neither the list nor its space were deleted
 * ("for a deleted list, the role they would have on it" of "Who" of `openapi/public/trash.yaml`):
 * the highest of the grant of the list, which reaches guests too ("Elle ne verra que cette
 * liste"), and, for a member who is not a guest, `edit` as owner of the space ("Propriétaire",
 * whatever the switch), `edit` in a space `organization` while the switch "Accès de
 * l’organisation" of the list is on, and the grant of the space (whatever the switch). A list of a
 * space awaiting an owner gives nobody a role. The grants of a tombstone stay with it, so they
 * still count. Only the trash and the restoration of a deleted list read this role; every other
 * reading goes through `listRoleOf`.
 *
 * @param {AccessSpace} space - The space of the list, deleted or not.
 * @param {Pick<TaskListState, 'organizationAccess'>} list - The list, deleted or not.
 * @param {Viewer} viewer - The member who asks.
 * @param {ListGrants} grants - The grants of the viewer on the space and on the list.
 * @returns {AccessRole | null} The role, or `null` when the viewer would have none.
 */
export function listRoleAsIfNotDeletedOf(
  space: AccessSpace,
  list: Pick<TaskListState, 'organizationAccess'>,
  viewer: Viewer,
  grants: ListGrants,
): AccessRole | null {
  if (space.awaitingOwner === true) {
    return null;
  }
  if (viewer.role === 'guest') {
    return grants.list;
  }
  return highestRole([
    grants.list,
    space.ownerUserId === viewer.userId ? 'edit' : null,
    organizationListRoleOf(space, list),
    grants.space,
  ]);
}

/**
 * Function canSeeSpace
 *
 * @description
 * Whether a member sees a space ("Access" of `openapi/public/spaces.yaml`): when they have a role
 * on it, or a grant of one of its lists, which shows the space with `callerRole: null` and those
 * lists only. Nobody sees a space awaiting an owner, nor a deleted space ("Deletion" of
 * `openapi/public/spaces.yaml`). A space the member does not see answers as an unknown one and is
 * left out of every collection and count (P3a promise).
 *
 * @param {AccessSpace} space - The space.
 * @param {Viewer} viewer - The member who asks.
 * @param {Pick<ListGrants, 'space'> & { readonly anyList: boolean }} grants - The grant of the
 * viewer on the space, and whether they hold a grant on at least one list of it.
 * @returns {boolean} Whether the member sees the space.
 */
export function canSeeSpace(
  space: AccessSpace,
  viewer: Viewer,
  grants: Pick<ListGrants, 'space'> & { readonly anyList: boolean },
): boolean {
  if (space.awaitingOwner === true || space.deletedAt !== null) {
    return false;
  }
  return spaceRoleOf(space, viewer, grants.space) !== null || grants.anyList;
}

/**
 * Function canManageSpace
 *
 * @description
 * Whether a member manages a space (`callerCanManage`, decision 3 of P3b-1 as the contract fixed
 * it): changes its visibility (`403 space.visibility-forbidden`), shares it and deletes it
 * (`403 space.manage-forbidden`). The owner of the space, and for a space `organization` the owner
 * and the admins of the organization; never a guest, and nobody for a space awaiting an owner or
 * a deleted space. The owner and the admins of the organization do not manage a private space,
 * even one shared with them (they never saw one in P3a).
 *
 * @param {AccessSpace} space - The space.
 * @param {Viewer} viewer - The member who asks.
 * @returns {boolean} Whether the member manages the space.
 */
export function canManageSpace(space: AccessSpace, viewer: Viewer): boolean {
  if (space.awaitingOwner === true || space.deletedAt !== null || viewer.role === 'guest') {
    return false;
  }
  if (space.ownerUserId === viewer.userId) {
    return true;
  }
  return (
    space.visibility === 'organization' && (viewer.role === 'owner' || viewer.role === 'admin')
  );
}

/**
 * Function canEdit
 *
 * @description
 * Whether a role allows a change: changes of a space, a list and its tasks need `edit` (decision 2
 * of P3b-1); `comment` reads like `view` until comments exist.
 *
 * @param {AccessRole | null} role - The effective role, `null` for none.
 * @returns {boolean} Whether it is `edit`.
 */
export function canEdit(role: AccessRole | null): boolean {
  return role === 'edit';
}

/**
 * Function canManageListAccess
 *
 * @description
 * Whether a role on a list lets a member manage who reaches it: give and remove its grants, turn
 * its switch "Accès de l’organisation", and answer the access requests of the list and of its
 * tasks (decision 3 of P3b-1, "the mockup has no gate": whoever has `edit` on the list).
 *
 * @param {AccessRole | null} role - The effective role on the list, `null` for none.
 * @returns {boolean} Whether the member manages the access of the list.
 */
export function canManageListAccess(role: AccessRole | null): boolean {
  return canEdit(role);
}

/**
 * Function isHighestRole
 *
 * @description
 * Whether a role is the highest there is (`edit`), so that no other source can raise it: a
 * reading of the grants can be skipped once a rule gives it.
 *
 * @param {AccessRole | null} role - The role, `null` for none.
 * @returns {boolean} Whether no role ranks above it.
 */
export function isHighestRole(role: AccessRole | null): boolean {
  return role !== null && rankOf(role) === rankOf('edit');
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
