import {
  canManageSpace,
  canSeeSpace,
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
 * space already gives `edit` on everything asked, the highest role, as before grants existed.
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
    if (space.awaitingOwner) {
      return without;
    }
    if (without.spaceRole === 'edit' && (list === null || without.listRole === 'edit')) {
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
  // #endregion
}
