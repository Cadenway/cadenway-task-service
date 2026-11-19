import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import type { FindAccessTargetInput } from './find-access-target.input.js';
import type { FindAccessTargetOutput } from './find-access-target.output.js';

/**
 * Class FindAccessTarget
 *
 * @description
 * Public operation of the spaces module for the access-requests module: the space or the list an
 * access request names (decision 4 of P3b-1), whether the member sees it or not, with its names,
 * the owner of the space and the access of the member: their role on the space for a space
 * (`spaceRoleOf`), on the list for a list (`listRoleOf`), and whether they answer its requests
 * (`canManageSpace` for a space, `edit` on the list for a list). `null` only when the organization
 * has no such space or list, so that the caller decides what to tell the member. The role of the
 * member comes from the caller, which read it from the copy of the memberships. It runs in
 * `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller; it reads the grants of
 * the member in one statement, takes no lock and appends no event.
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
   * Decides what the member reaches of the target.
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
        const space: Space | null = await store.spaces.find(input.organizationId, target.spaceId);
        if (space === null) {
          return null;
        }
        const access: ViewerAccess = await this.access.resolve(
          store.grants,
          viewer,
          space.snapshot,
          null,
        );
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
      const list: TaskList | null = await store.lists.find(input.organizationId, target.listId);
      if (list === null) {
        return null;
      }
      const space: Space | null = await store.spaces.find(
        input.organizationId,
        list.snapshot.spaceId,
      );
      if (space === null) {
        return null;
      }
      const access: ViewerAccess = await this.access.resolve(
        store.grants,
        viewer,
        space.snapshot,
        list.snapshot,
      );
      return {
        kind: 'list',
        spaceId: space.snapshot.id,
        spaceName: space.snapshot.name,
        spaceOwnerUserId: space.snapshot.ownerUserId,
        listId: list.snapshot.id,
        listName: list.snapshot.name,
        viewerRole: access.listRole,
        viewerManages: access.listRole === 'edit',
      };
    });
  }
  // #endregion
}
