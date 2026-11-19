import {
  canManageListAccess,
  canManageSpace,
} from '../../../../../domain/policies/access/access-role.policy.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toListRoles } from '../../../../mappers/list/list-role.mapper.js';
import type { ListAccess } from '../../../../models/access/list-access.model.js';
import type { SpaceWithGrants } from '../../../../models/access/space-with-grants.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { ListManagedAccessTargetsInput } from './list-managed-access-targets.input.js';
import type { ListManagedAccessTargetsOutput } from './list-managed-access-targets.output.js';

/**
 * Class ListManagedAccessTargets
 *
 * @description
 * Public operation of the spaces module for the access-requests module: what a member answers
 * access requests for (decision 3 of P3b-1), the spaces they manage (`canManageSpace`: the owner
 * of the space, and for a space `organization` the owner and the admins of the organization) and
 * the lists they have `edit` on (`listRoleOf`), both in sidebar order. Two queries, unpaged (the
 * spaces and lists of an organization are few), with the visibility conditions of the spaces and
 * the lists, the lists read lean (what the role needs only); the policies give a guest no space
 * to manage. The role of the member comes from the caller, which read it from the copy of the
 * memberships. It runs in `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller;
 * it takes no lock and appends no event.
 */
export class ListManagedAccessTargets {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the use case.
   *
   * @type {SpacesUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: SpacesUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: SpacesUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the spaces the member manages and the lists they have `edit` on.
   *
   * @param {ListManagedAccessTargetsInput} input - The member and its role.
   * @returns {Promise<ListManagedAccessTargetsOutput>} Their ids.
   */
  public async execute(
    input: ListManagedAccessTargetsInput,
  ): Promise<ListManagedAccessTargetsOutput> {
    return this.unitOfWork.run(
      async (store: SpacesStore): Promise<ListManagedAccessTargetsOutput> => {
        const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
        const spaces: SpaceWithGrants[] = await store.spaces.listAllVisible(
          input.organizationId,
          viewer,
        );
        const lists: ListAccess[] = await store.lists.listAccessesVisibleTo(
          input.organizationId,
          viewer,
        );
        return {
          spaceIds: spaces
            .filter((row: SpaceWithGrants): boolean => canManageSpace(row.space.snapshot, viewer))
            .map((row: SpaceWithGrants): string => row.space.snapshot.id),
          listIds: toListRoles(lists, viewer)
            .filter((role): boolean => canManageListAccess(role.callerRole))
            .map((role): string => role.listId),
        };
      },
    );
  }
  // #endregion
}
