import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import { toVisibleList } from '../../../../mappers/list/visible-list.mapper.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { ListSidebarListsInput } from './list-sidebar-lists.input.js';
import type { ListSidebarListsOutput } from './list-sidebar-lists.output.js';

/**
 * Class ListSidebarLists
 *
 * @description
 * Public operation of the spaces module for the tasks module: the first lists of the sidebar of a
 * member, in sidebar order (the spaces by creation, then the lists of each space by creation),
 * sprints included, at most `limit`. A guest sees no space and gets an empty list without a read;
 * any other member gets the spaces of the whole organization and the private ones it owns, never
 * one awaiting an owner (the filter of `SpaceRepository.listVisible`). The role comes from the
 * caller, which read it from the copy of the memberships. It runs in `SpacesUnitOfWork.run`, which
 * joins the tenant transaction of the caller, scoped to the organization of the input; it takes no
 * lock and appends no event.
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
   * Reads the first lists of the spaces the member sees.
   *
   * @param {ListSidebarListsInput} input - The member, its role and the bound.
   * @returns {Promise<ListSidebarListsOutput>} The lists.
   */
  public async execute(input: ListSidebarListsInput): Promise<ListSidebarListsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListSidebarListsOutput> => {
      if (input.viewerRole === 'guest') {
        return { lists: [] };
      }
      const lists: TaskList[] = await store.lists.listFirstVisibleTo(
        input.organizationId,
        input.viewerUserId,
        input.limit,
      );
      return { lists: lists.map((list: TaskList) => toVisibleList(list.snapshot)) };
    });
  }
  // #endregion
}
