import {
  canManageSpace,
  canSeeSpace,
  isHighestRole,
  listRoleAsIfNotDeletedOf,
  listRoleOf,
  spaceRoleOf,
} from '../../../domain/policies/access/access-role.policy.js';
import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { TaskListState } from '../../../domain/value-objects/list/task-list-state.value-object.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { SpaceState } from '../../../domain/value-objects/space/space-state.value-object.js';
import type { ViewerAccess } from '../../models/access/viewer-access.model.js';
import type { ViewerGrants } from '../../models/access/viewer-grants.model.js';
import type { GrantRepository } from '../../ports/outbound/persistence/access/grant-repository.port.js';

/**
 * Constant NO_GRANTS
 *
 * @description
 * The grants of a member who holds none, to compute what the rule of the organization and the
 * ownership of the space give without reading the grants.
 *
 * @type {ViewerGrants}
 */
const NO_GRANTS: ViewerGrants = Object.freeze({ space: null, list: null, anyList: false });

/**
 * Class AccessResolver
 *
 * @description
 * Decides what a member reaches of one space and, optionally, of one of its lists, with the
 * policies of the domain (`spaceRoleOf`, `listRoleOf`, `canSeeSpace`, `canManageSpace`, decision 2
 * of P3b-1). The grants of the member are read in ONE statement (the grant of the space, the grant
 * of the list, whether they hold a grant of any list of the space), joined to the transaction of
 * the caller; the reading is skipped when the rule of the organization or the ownership of the
 * space already gives `edit` on everything asked, the highest role, as before grants existed, and
 * for a space awaiting an owner or a tombstone, which give nothing. The trash and the restoration
 * of a deleted list read the role "as if not deleted" (`listRoleAsIfNotDeleted`).
 */
export class AccessResolver {
  // #region Methods
  /**
   * Method resolve
   *
   * @description
   * Reads the grants of the member when they can change the answer, then applies the policies.
   *
   * @param {GrantRepository} grants - The grants, bound to the transaction of the caller.
   * @param {Viewer} viewer - The member and its role in the organization.
   * @param {SpaceState} space - The space.
   * @param {TaskListState | null} list - A list of the space, or `null` for the space alone.
   * @returns {Promise<ViewerAccess>} What the member reaches.
   */
  public async resolve(
    grants: GrantRepository,
    viewer: Viewer,
    space: SpaceState,
    list: TaskListState | null,
  ): Promise<ViewerAccess> {
    const without: ViewerAccess = this.fromGrants(viewer, space, list, NO_GRANTS);
    if (space.awaitingOwner || space.deletedAt !== null || (list?.deletedAt ?? null) !== null) {
      return without;
    }
    if (isHighestRole(without.spaceRole) && (list === null || isHighestRole(without.listRole))) {
      return without;
    }
    const read: ViewerGrants = await grants.viewerGrants(
      space.organizationId,
      viewer.userId,
      space.id,
      list === null ? null : list.id,
    );
    return this.fromGrants(viewer, space, list, read);
  }

  /**
   * Method fromGrants
   *
   * @description
   * Applies the policies to grants already read, as for the rows of a collection.
   *
   * @param {Viewer} viewer - The member and its role in the organization.
   * @param {SpaceState} space - The space.
   * @param {TaskListState | null} list - A list of the space, or `null` for the space alone.
   * @param {ViewerGrants} grants - The grants of the member there.
   * @returns {ViewerAccess} What the member reaches.
   */
  public fromGrants(
    viewer: Viewer,
    space: SpaceState,
    list: TaskListState | null,
    grants: ViewerGrants,
  ): ViewerAccess {
    const spaceRole: AccessRole | null = spaceRoleOf(space, viewer, grants.space);
    return {
      seesSpace: canSeeSpace(space, viewer, { space: grants.space, anyList: grants.anyList }),
      spaceRole,
      canManage: canManageSpace(space, viewer),
      listRole:
        list === null
          ? null
          : listRoleOf(space, list, viewer, { space: grants.space, list: grants.list }),
    };
  }

  /**
   * Method listRoleAsIfNotDeleted
   *
   * @description
   * The role a member would have on a list if neither the list nor its space were deleted
   * (`listRoleAsIfNotDeletedOf`, "Who" of `openapi/public/trash.yaml`), the grants a tombstone
   * keeps included: read in the same ONE statement, skipped when the rule of the organization or
   * the ownership of the space already gives `edit`.
   *
   * @param {GrantRepository} grants - The grants, bound to the transaction of the caller.
   * @param {Viewer} viewer - The member and its role in the organization.
   * @param {SpaceState} space - The space of the list, deleted or not.
   * @param {TaskListState} list - The list, deleted or not.
   * @returns {Promise<AccessRole | null>} The role, or `null` when the member would have none.
   */
  public async listRoleAsIfNotDeleted(
    grants: GrantRepository,
    viewer: Viewer,
    space: SpaceState,
    list: TaskListState,
  ): Promise<AccessRole | null> {
    const without: AccessRole | null = listRoleAsIfNotDeletedOf(space, list, viewer, NO_GRANTS);
    if (space.awaitingOwner || isHighestRole(without)) {
      return without;
    }
    const read: ViewerGrants = await grants.viewerGrants(
      space.organizationId,
      viewer.userId,
      space.id,
      list.id,
    );
    return listRoleAsIfNotDeletedOf(space, list, viewer, read);
  }
  // #endregion
}
