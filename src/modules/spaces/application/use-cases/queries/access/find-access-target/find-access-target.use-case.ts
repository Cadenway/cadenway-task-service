import { canManageListAccess } from '../../../../../domain/policies/access/access-role.policy.js';
import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import type { ViewerGrants } from '../../../../models/access/viewer-grants.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import type { FindAccessTargetInput } from './find-access-target.input.js';
import type { FindAccessTargetOutput } from './find-access-target.output.js';

/**
 * Constant NO_TARGET
 *
 * @description
 * The nil UUID, which no space or list has: the id the readings use in place of a target that
 * does not exist, so that they run all the same.
 *
 * @type {string}
 */
const NO_TARGET: string = '00000000-0000-0000-0000-000000000000';

/**
 * Class FindAccessTarget
 *
 * @description
 * Public operation of the spaces module for the access-requests module: the space or the list an
 * access request names (decision 4 of P3b-1), whether the member sees it or not, with its names,
 * the owner of the space and the access of the member: their role on the space for a space
 * (`spaceRoleOf`), on the list for a list (`listRoleOf`), and whether they answer its requests
 * (`canManageSpace` for a space, `canManageListAccess` for a list). `null` only when the
 * organization has no such space or list, so that the caller decides what to tell the member.
 * The same statements run whatever the outcome, so that their number and kind tell nothing of the
 * existence of the target: for a space, the space and the grants of the member; for a list, the
 * list, its space and the grants of the member; an unknown target is read with the nil UUID in
 * its place, and the grants are always read (no shortcut by the rule of the organization). The
 * role of the member comes from the caller, which read it from the copy of the memberships. It
 * runs in `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller, and appends no
 * event. With `lock: 'share'` the reading of the row of the target (the space for a space, the
 * list for a list) takes `FOR SHARE` in the same statement whatever the outcome (an unknown target
 * locks nothing, as no row matches the nil UUID or its id): a deletion of the target, which locks
 * that row `FOR NO KEY UPDATE`, either committed first and the target reads unknown, or waits for
 * the caller, whose clean-up then sees what it stored. A deleted target is never found. Without it
 * (`none`, the default), no lock.
 */
export class FindAccessTarget {
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

  /**
   * Property access
   *
   * @description
   * Decides what the member reaches of the target from the grants read.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver;
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
    this.access = new AccessResolver();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the target and the access of the member to it.
   *
   * @param {FindAccessTargetInput} input - The member, its role and the target.
   * @returns {Promise<FindAccessTargetOutput>} The target, or `null` when it does not exist.
   */
  public async execute(input: FindAccessTargetInput): Promise<FindAccessTargetOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<FindAccessTargetOutput> => {
      const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
      const target: FindAccessTargetInput['target'] = input.target;
      if (target.kind === 'space') {
        const space: Space | null =
          input.lock === 'share'
            ? await store.spaces.lockShared(input.organizationId, target.spaceId)
            : await store.spaces.find(input.organizationId, target.spaceId);
        const grants: ViewerGrants = await store.grants.viewerGrants(
          input.organizationId,
          viewer.userId,
          space?.snapshot.id ?? NO_TARGET,
          null,
        );
        if (space === null) {
          return null;
        }
        const access: ViewerAccess = this.access.fromGrants(viewer, space.snapshot, null, grants);
        return {
          kind: 'space',
          spaceId: space.snapshot.id,
          spaceName: space.snapshot.name,
          spaceOwnerUserId: space.snapshot.ownerUserId,
          listId: null,
          listName: null,
          viewerRole: access.spaceRole,
          viewerManages: access.canManage,
        };
      }
      const list: TaskList | null =
        input.lock === 'share'
          ? await store.lists.lockShared(input.organizationId, target.listId)
          : await store.lists.find(input.organizationId, target.listId);
      const space: Space | null = await store.spaces.find(
        input.organizationId,
        list?.snapshot.spaceId ?? NO_TARGET,
      );
      const grants: ViewerGrants = await store.grants.viewerGrants(
        input.organizationId,
        viewer.userId,
        space?.snapshot.id ?? NO_TARGET,
        list?.snapshot.id ?? NO_TARGET,
      );
      if (list === null || space === null) {
        return null;
      }
      const access: ViewerAccess = this.access.fromGrants(
        viewer,
        space.snapshot,
        list.snapshot,
        grants,
      );
      return {
        kind: 'list',
        spaceId: space.snapshot.id,
        spaceName: space.snapshot.name,
        spaceOwnerUserId: space.snapshot.ownerUserId,
        listId: list.snapshot.id,
        listName: list.snapshot.name,
        viewerRole: access.listRole,
        viewerManages: canManageListAccess(access.listRole),
      };
    });
  }
  // #endregion
}
