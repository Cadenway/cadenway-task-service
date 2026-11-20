import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { ListDeletedSpaceListsInput } from './list-deleted-space-lists.input.js';
import type { ListDeletedSpaceListsOutput } from './list-deleted-space-lists.output.js';

/**
 * Class ListDeletedSpaceLists
 *
 * @description
 * Public operation of the spaces module for the deletion-lifecycle module: holds a space
 * `FOR SHARE` until the end of the transaction of the caller, deleted or not, and reads where it
 * stands (`deleted`, `live` once restored, `gone` once erased or unknown) and its deleted lists that
 * are not erased yet, by id, so that the job of a
 * deleted space moves the tasks of each to the trash ("A job then moves the tasks to the trash in
 * bounded batches" of `DELETE /v1/spaces/{spaceId}`) and drops the access requests of the space
 * itself when it is deleted or gone. The lists are those deleted with the space and those deleted on
 * their own before it, whose tasks a job of their own may still be moving; they stay deleted when a
 * restoration brought the space back with one other list. The lock serializes with a restoration
 * (`FOR NO KEY UPDATE`) and an erasure (`FOR UPDATE`) of the space: either it committed first and
 * the space reads `live` or `gone`, or it waits for the caller. One lock by primary key, then one
 * range of the index of the lists of a space; no event. It runs in `SpacesUnitOfWork.run`, which
 * joins the tenant transaction of the caller.
 */
export class ListDeletedSpaceLists {
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
   * Holds the space and reads where it stands, then the ids of its deleted lists.
   *
   * @param {ListDeletedSpaceListsInput} input - The organization and the space.
   * @returns {Promise<ListDeletedSpaceListsOutput>} Where the space stands, and the ids.
   */
  public async execute(input: ListDeletedSpaceListsInput): Promise<ListDeletedSpaceListsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListDeletedSpaceListsOutput> => {
      const space: Space | null = await store.spaces.lockIncludingDeleted(
        input.organizationId,
        input.spaceId,
        'share',
      );
      if (space === null) {
        return { space: 'gone', listIds: [] };
      }
      return {
        space: space.isDeleted ? 'deleted' : 'live',
        listIds: await store.lists.listDeletedIdsOfSpace(input.organizationId, input.spaceId),
      };
    });
  }
  // #endregion
}
