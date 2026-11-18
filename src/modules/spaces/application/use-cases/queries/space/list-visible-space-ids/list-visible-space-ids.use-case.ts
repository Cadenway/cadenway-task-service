import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { ListVisibleSpaceIdsInput } from './list-visible-space-ids.input.js';
import type { ListVisibleSpaceIdsOutput } from './list-visible-space-ids.output.js';

/**
 * Class ListVisibleSpaceIds
 *
 * @description
 * Public operation of the spaces module for the tasks module: the ids of every space a member sees,
 * to keep, in a collection of tasks or activity, what lies in those spaces only. A guest sees no
 * space and gets an empty list without a read; any other member gets the spaces of the whole
 * organization and the private ones it owns, never one awaiting an owner (the filter of
 * `SpaceRepository.listVisibleIds`, the one of `listVisible`). The role comes from the caller, which
 * read it from the copy of the memberships. It runs in `SpacesUnitOfWork.run`, which joins the tenant
 * transaction of the caller, scoped to the organization of the input; it takes no lock and appends
 * no event.
 */
export class ListVisibleSpaceIds {
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
   * Reads the ids of the spaces the member sees.
   *
   * @param {ListVisibleSpaceIdsInput} input - The member and its role.
   * @returns {Promise<ListVisibleSpaceIdsOutput>} The ids of its spaces.
   */
  public async execute(input: ListVisibleSpaceIdsInput): Promise<ListVisibleSpaceIdsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListVisibleSpaceIdsOutput> => {
      if (input.viewerRole === 'guest') {
        return { spaceIds: [] };
      }
      return {
        spaceIds: await store.spaces.listVisibleIds(input.organizationId, input.viewerUserId),
      };
    });
  }
  // #endregion
}
