import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toListViews } from '../../../../mappers/list/list-view.mapper.js';
import { toVisibleList } from '../../../../mappers/list/visible-list.mapper.js';
import type { ListWithGrants } from '../../../../models/access/list-with-grants.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { ListView } from '../../../../projections/list/list-view.projection.js';
import type { ListArchivedListsInput } from './list-archived-lists.input.js';
import type { ListArchivedListsOutput } from './list-archived-lists.output.js';

/**
 * Class ListArchivedLists
 *
 * @description
 * Public operation of the spaces module for the tasks module, which serves the archives ("Archives",
 * tab "Listes", "The archives list what the caller sees" of `openapi/public/archives.yaml`): a
 * page of the archived lists of the organization the member has a role on, with the ONE
 * visibility condition of the collections of lists, the most recently archived first
 * (`archivedAt` descending, id descending), after `after`, at most `limit`, and how many they are
 * in all. The role of each row comes from `listRoleOf`; a row the policy refuses all the same is
 * left out (fail closed). The role of the member comes from the caller, which read it from the
 * copy of the memberships. It runs in `SpacesUnitOfWork.run`, which joins the tenant transaction
 * of the caller (read-only or not), scoped to the organization of the input; two statements, no
 * lock, no event.
 */
export class ListArchivedLists {
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
   * Reads the page and the count of the archived lists of the member.
   *
   * @param {ListArchivedListsInput} input - The member, its role, the start and the size of the
   * page.
   * @returns {Promise<ListArchivedListsOutput>} The page and the total.
   */
  public async execute(input: ListArchivedListsInput): Promise<ListArchivedListsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListArchivedListsOutput> => {
      const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
      const rows: ListWithGrants[] = await store.lists.listArchivedVisibleTo(
        input.organizationId,
        viewer,
        input.after,
        input.limit,
      );
      const total: number = await store.lists.countArchivedVisibleTo(input.organizationId, viewer);
      return {
        lists: toListViews(rows, viewer).map((view: ListView) =>
          toVisibleList(view.list, view.callerRole),
        ),
        total,
      };
    });
  }
  // #endregion
}
