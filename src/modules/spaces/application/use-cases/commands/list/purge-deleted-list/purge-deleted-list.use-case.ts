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
 * list without lock first, and locks only a deleted one, so that it never locks a live list: its
 * space `FOR NO KEY UPDATE`, then the list `FOR UPDATE`, spaces before lists as every locker (the
 * global lock order of `src/modules/tasks/MODULE.md`); it decides again on the locked rows. Its
 * callers (`LockTrashLists` in `erase`, `LockDeletedList`) hold these locks already, so it waits
 * for nothing new there. An unknown or erased list answers `not-found`, a live one `not-deleted`,
 * each writing nothing. Otherwise it erases the grants of the list and its row; then, when its
 * space reads deleted under the lock, it hands the space to the one erasure of a deleted space
 * (`DeletedSpaceEraser`: the space locked `FOR UPDATE`, erased with its grants when no list row of
 * it is left, its prefix rows kept). That `FOR UPDATE` strengthens the `FOR NO KEY UPDATE` the
 * transaction holds, which no other transaction shares but the `FOR KEY SHARE` of a foreign-key
 * check, and a deleted space takes no new row (a creation holds the space or a list of it first,
 * which conflicts), so it waits for no holder that waits for the caller. The caller guarantees
 * that no task references the list (it read the tasks under the lock of the list; a deleted list
 * takes no new task, `HoldList`). No event: the contract defines none for the erasure of a
 * tombstone. It runs in `SpacesUnitOfWork.run`, which joins the transaction of the caller.
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
      const space: Space | null = await store.spaces.lockIncludingDeleted(
        input.organizationId,
        seen.snapshot.spaceId,
        'update',
      );
      const list: TaskList | null = await store.lists.lockIncludingDeleted(
        input.organizationId,
        input.listId,
        'delete',
      );
      if (space === null || list === null) {
        return { outcome: 'not-found' };
      }
      if (!list.isDeleted) {
        return { outcome: 'not-deleted' };
      }
      await store.grants.eraseOfList(input.organizationId, list.snapshot.id);
      await store.lists.erase(input.organizationId, list.snapshot.id);
      return {
        outcome: 'purged',
        spacePurged:
          space.isDeleted &&
          (await this.eraser.erase(store, input.organizationId, list.snapshot.spaceId)) ===
            'purged',
      };
    });
  }
  // #endregion
}
