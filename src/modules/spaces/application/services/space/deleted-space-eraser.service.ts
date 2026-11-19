import type { Space } from '../../../domain/aggregates/space/space.aggregate.js';
import type { SpaceErasure } from '../../models/space/space-erasure.model.js';
import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';

/**
 * Class DeletedSpaceEraser
 *
 * @description
 * The ONE erasure of a deleted space that holds no list row any more ("A deleted list or space is
 * erased with the last of its entries. Nothing comes back from it." of "Erasing" of
 * `openapi/public/trash.yaml`), shared by `PurgeDeletedList` (after the last list of the space) and
 * `PurgeDeletedSpace` (a space deleted with no list holding a task). It locks the space
 * `FOR UPDATE`, then decides on the locked row: unknown or erased `not-found`, live
 * `not-deleted`, still holding a list row `not-empty`, each writing nothing; otherwise it erases
 * the grants of the space and its row. The prefix rows of the space stay, so its prefixes stay
 * reserved and their numbers never go back. No event: the contract defines none for the erasure
 * of a tombstone.
 */
export class DeletedSpaceEraser {
  // #region Methods
  /**
   * Method erase
   *
   * @description
   * Locks the space and erases it when it is deleted and empty.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @returns {Promise<SpaceErasure>} What the erasure did.
   */
  public async erase(
    store: SpacesStore,
    organizationId: string,
    spaceId: string,
  ): Promise<SpaceErasure> {
    const space: Space | null = await store.spaces.lockIncludingDeleted(
      organizationId,
      spaceId,
      'delete',
    );
    if (space === null) {
      return 'not-found';
    }
    if (!space.isDeleted) {
      return 'not-deleted';
    }
    if (await store.lists.anyOfSpace(organizationId, spaceId)) {
      return 'not-empty';
    }
    await store.grants.eraseOfSpace(organizationId, spaceId);
    await store.spaces.erase(organizationId, spaceId);
    return 'purged';
  }
  // #endregion
}
