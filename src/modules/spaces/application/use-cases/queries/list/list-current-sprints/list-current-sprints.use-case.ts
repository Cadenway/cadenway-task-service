import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import { toVisibleList } from '../../../../mappers/list/visible-list.mapper.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { ListCurrentSprintsInput } from './list-current-sprints.input.js';
import type { ListCurrentSprintsOutput } from './list-current-sprints.output.js';

/**
 * Class ListCurrentSprints
 *
 * @description
 * Public operation of the spaces module for the tasks module: the sprints under way in the spaces a
 * member sees, that is those whose start is on or before `today` and whose end is on or after it,
 * ordered by end date, then creation, at most `limit`. A guest sees no space and gets an empty
 * list without a read; any other member gets the spaces of the whole organization and the private
 * ones it owns, never one awaiting an owner (the filter of `SpaceRepository.listVisible`). The role
 * comes from the caller, which read it from the copy of the memberships. It runs in
 * `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller, scoped to the
 * organization of the input; it takes no lock and appends no event.
 */
export class ListCurrentSprints {
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
   * Reads the sprints under way in the spaces the member sees.
   *
   * @param {ListCurrentSprintsInput} input - The member, its role, the day and the bound.
   * @returns {Promise<ListCurrentSprintsOutput>} The sprints.
   */
  public async execute(input: ListCurrentSprintsInput): Promise<ListCurrentSprintsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListCurrentSprintsOutput> => {
      if (input.viewerRole === 'guest') {
        return { lists: [] };
      }
      const lists: TaskList[] = await store.lists.listCurrentSprintsVisibleTo(
        input.organizationId,
        input.viewerUserId,
        input.today,
        input.limit,
      );
      return { lists: lists.map((list: TaskList) => toVisibleList(list.snapshot)) };
    });
  }
  // #endregion
}
