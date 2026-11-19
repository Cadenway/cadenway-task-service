import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toListViews } from '../../../../mappers/list/list-view.mapper.js';
import { toVisibleList } from '../../../../mappers/list/visible-list.mapper.js';
import type { ListWithGrants } from '../../../../models/access/list-with-grants.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { ListView } from '../../../../projections/list/list-view.projection.js';
import type { ListSidebarListsInput } from './list-sidebar-lists.input.js';
import type { ListSidebarListsOutput } from './list-sidebar-lists.output.js';

/**
 * Class ListSidebarLists
 *
 * @description
 * Public operation of the spaces module for the tasks module: the first live lists of the sidebar
 * of a member, in sidebar order (the spaces by creation, then the lists of each space by their
 * position there, `positionInSpaceOf`), sprints included, at most `limit`, each with the role of
 * the member; an archived list leaves the sidebar and "Accueil" ("Lists" of
 * `openapi/public/archives.yaml`). Only the lists the member
 * has a role on: a guest gets the lists shared with them, any other member also those the rule of
 * the organization, the ownership of a space or a grant of a space gives them, never one of a
 * space awaiting an owner (the one visibility condition of the lists, then `listRoleOf`). The role
 * comes from the caller, which read it from the copy of the memberships. It runs in
 * `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller, scoped to the
 * organization of the input; it takes no lock and appends no event.
 */
export class ListSidebarLists {
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
   * Reads the first lists the member has a role on.
   *
   * @param {ListSidebarListsInput} input - The member, its role and the bound.
   * @returns {Promise<ListSidebarListsOutput>} The lists.
   */
  public async execute(input: ListSidebarListsInput): Promise<ListSidebarListsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListSidebarListsOutput> => {
      const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
      const rows: ListWithGrants[] = await store.lists.listFirstVisibleTo(
        input.organizationId,
        viewer,
        input.limit,
      );
      return {
        lists: toListViews(rows, viewer).map((view: ListView) =>
          toVisibleList(view.list, view.callerRole),
        ),
      };
    });
  }
  // #endregion
}
