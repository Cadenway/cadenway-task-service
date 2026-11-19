import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toVisibleList } from '../../../../mappers/list/visible-list.mapper.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { VisibleSpace } from '../../../../projections/space/visible-space.projection.js';
import type { SpaceView } from '../../../../projections/space/space-view.projection.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import { SpaceViewBuilder } from '../../../../services/space/space-view-builder.service.js';
import type { FindVisibleListInput } from './find-visible-list.input.js';
import type { FindVisibleListOutput } from './find-visible-list.output.js';

/**
 * Class FindVisibleList
 *
 * @description
 * Public operation of the spaces module for the tasks module: finds a list the member has a role
 * on, with its space, the effective role of the member on the list (`callerRole`, which changes
 * of the list and its tasks need at `edit`) and their access to the space (`callerRole`,
 * `callerCanManage`). A list that does not exist, a list of another organization and a list the
 * member has no role on (`listRoleOf`: a private space of another not shared with them, a switch
 * "Accès de l’organisation" off, a guest without the grant of the list, a space awaiting an owner)
 * all answer `null`; the caller turns it into its own refusal, so no case tells another apart. The
 * role of the member in the organization comes from the caller, which read it from the copy of the
 * memberships. It runs in `SpacesUnitOfWork.run`, which joins the tenant transaction of the
 * caller, scoped to the organization of the input; it reads the grants of the member in one
 * statement, takes no lock and appends no event.
 */
export class FindVisibleList {
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
   * Decides what the member reaches of the list and its space.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver;

  /**
   * Property views
   *
   * @description
   * Adds the next key to the space.
   *
   * @type {SpaceViewBuilder}
   * @readonly
   */
  private readonly views: SpaceViewBuilder;
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
    this.views = new SpaceViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the list and its space, and the role of the member on them.
   *
   * @param {FindVisibleListInput} input - The member, its role and the list.
   * @returns {Promise<FindVisibleListOutput | null>} The list and its space, or `null` when the
   * member has no role on the list.
   */
  public async execute(input: FindVisibleListInput): Promise<FindVisibleListOutput | null> {
    return this.unitOfWork.run(
      async (store: SpacesStore): Promise<FindVisibleListOutput | null> => {
        const list: TaskList | null = await store.lists.find(input.organizationId, input.listId);
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
        const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
        const access: ViewerAccess = await this.access.resolve(
          store.grants,
          viewer,
          space.snapshot,
          list.snapshot,
        );
        if (access.listRole === null) {
          return null;
        }
        const view: SpaceView = await this.views.buildOne(
          store.prefixes,
          input.organizationId,
          space.snapshot,
          { callerRole: access.spaceRole, callerCanManage: access.canManage },
        );
        return {
          list: toVisibleList(list.snapshot, access.listRole),
          space: this.toVisibleSpace(view),
        };
      },
    );
  }

  /**
   * Method toVisibleSpace
   *
   * @description
   * Copies a space, its next key and the access of the member into the public projection.
   *
   * @param {SpaceView} view - The stored space, the key its next task would take and the access.
   * @returns {VisibleSpace} The projection.
   */
  private toVisibleSpace(view: SpaceView): VisibleSpace {
    const { space, nextKey }: SpaceView = view;
    return {
      id: space.id,
      name: space.name,
      prefix: space.prefix,
      description: space.description,
      icon: space.icon,
      color: space.color,
      visibility: space.visibility,
      ownerUserId: space.ownerUserId,
      statuses: space.statuses,
      nextKey,
      createdAt: space.createdAt,
      version: space.version,
      callerRole: view.callerRole,
      callerCanManage: view.callerCanManage,
    };
  }
  // #endregion
}
