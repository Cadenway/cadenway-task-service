import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { DeletedSpaceEraser } from '../../../../services/space/deleted-space-eraser.service.js';
import type { PurgeDeletedListInput } from './purge-deleted-list.input.js';
import type { PurgeDeletedListOutput } from './purge-deleted-list.output.js';

/**
 * Class PurgeDeletedList
 *
 * @description
 * Public operation of the spaces module for the tasks module: erases a deleted list once the last
 * of its trash entries is erased ("A deleted list or space is erased with the last of its
 * entries. Nothing comes back from it." of "Erasing" of `openapi/public/trash.yaml`). It reads the
 * list without lock first, and locks `FOR UPDATE` only a deleted one, so that the batches of the
 * purge never lock a live list; it decides again on the locked row. An unknown or erased list
 * answers `not-found`, a live one `not-deleted`, each writing nothing. Otherwise it erases the
 * grants of the list and its row; then, when its space reads deleted, it hands the space to the one
 * erasure of a deleted space (`DeletedSpaceEraser`: the space locked `FOR UPDATE`, erased with its
 * grants when no list row of it is left, its prefix rows kept). The caller guarantees that no task
 * references the list (it read the tasks; a deleted list takes no new task, `HoldList`). Locking
 * the list before its space is safe here: a restoration needs an entry of the list, and the caller
 * found none. No event: the contract defines none for the erasure of a tombstone. It runs in
 * `SpacesUnitOfWork.run`, which joins the transaction of the caller.
 */
export class PurgeDeletedList {
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
   * Erases the deleted space of the list once no list of it is left.
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
   * Erases the deleted list, then its deleted space when it was its last list.
   *
   * @param {PurgeDeletedListInput} input - The organization and the list.
   * @returns {Promise<PurgeDeletedListOutput>} What the erasure did.
   */
  public async execute(input: PurgeDeletedListInput): Promise<PurgeDeletedListOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<PurgeDeletedListOutput> => {
      const seen: TaskList | null = await store.lists.findIncludingDeleted(
        input.organizationId,
        input.listId,
      );
      if (seen === null) {
        return { outcome: 'not-found' };
      }
      if (!seen.isDeleted) {
        return { outcome: 'not-deleted' };
      }
      const list: TaskList | null = await store.lists.lockIncludingDeleted(
        input.organizationId,
        input.listId,
        'delete',
      );
      if (list === null) {
        return { outcome: 'not-found' };
      }
      if (!list.isDeleted) {
        return { outcome: 'not-deleted' };
      }
      await store.grants.eraseOfList(input.organizationId, list.snapshot.id);
      await store.lists.erase(input.organizationId, list.snapshot.id);
      const space: Space | null = await store.spaces.findIncludingDeleted(
        input.organizationId,
        list.snapshot.spaceId,
      );
      return {
        outcome: 'purged',
        spacePurged:
          space?.isDeleted === true &&
          (await this.eraser.erase(store, input.organizationId, list.snapshot.spaceId)) ===
            'purged',
      };
    });
  }
  // #endregion
}
