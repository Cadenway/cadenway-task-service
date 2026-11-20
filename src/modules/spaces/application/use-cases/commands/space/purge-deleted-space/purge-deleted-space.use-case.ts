import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { DeletedSpaceEraser } from '../../../../services/space/deleted-space-eraser.service.js';
import type { PurgeDeletedSpaceInput } from './purge-deleted-space.input.js';
import type { PurgeDeletedSpaceOutput } from './purge-deleted-space.output.js';

/**
 * Class PurgeDeletedSpace
 *
 * @description
 * Public operation of the spaces module for the deletion-lifecycle module: erases a deleted space
 * that holds no list row any more ("A deleted list or space is erased with the last of its
 * entries" of "Erasing" of `openapi/public/trash.yaml`), for a space deleted when none of its lists
 * held a task (the erasure of its last list, `PurgeDeletedList`, erases it otherwise), through the
 * one erasure of a deleted space (`DeletedSpaceEraser`): the space locked `FOR UPDATE`, unknown or
 * erased `not-found`, live `not-deleted`, still holding a list row `not-empty`, each writing
 * nothing; otherwise its grants and its row erased, its prefix rows kept. No event. It runs in
 * `SpacesUnitOfWork.run`, which joins the transaction of the caller.
 */
export class PurgeDeletedSpace {
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
   * Property eraser
   *
   * @description
   * Erases a deleted space with no list left.
   *
   * @type {DeletedSpaceEraser}
   * @readonly
   */
  private readonly eraser: DeletedSpaceEraser;
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
    this.eraser = new DeletedSpaceEraser();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Erases the deleted space when none of its lists is left.
   *
   * @param {PurgeDeletedSpaceInput} input - The organization and the space.
   * @returns {Promise<PurgeDeletedSpaceOutput>} What the erasure did.
   */
  public async execute(input: PurgeDeletedSpaceInput): Promise<PurgeDeletedSpaceOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<PurgeDeletedSpaceOutput> => ({
      outcome: await this.eraser.erase(store, input.organizationId, input.spaceId),
    }));
  }
  // #endregion
}
