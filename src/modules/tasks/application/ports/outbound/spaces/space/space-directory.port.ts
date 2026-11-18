import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { KeyAllocation } from '../../../../models/placement/key-allocation.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';

/**
 * Interface SpaceDirectory
 *
 * @description
 * What the tasks module asks the spaces module: where a list is and who sees it, the spaces an
 * actor sees, and the keys of new tasks. Bound to the public operations of spaces, which join the
 * tenant transaction of the use case. The tasks module keeps no copy of a space or a list.
 */
export interface SpaceDirectory {
  // #region Methods
  /**
   * Method findVisibleList
   *
   * @description
   * Finds a list and its space when the viewer sees the space; no lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} listId - The list.
   * @returns {Promise<ListPlacement | null>} The list and its space, or `null` when the list is
   * unknown, in another organization or in a space the viewer does not see (a guest sees none).
   */
  findVisibleList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<ListPlacement | null>;

  /**
   * Method visibleSpaceIds
   *
   * @description
   * Lists every space the viewer sees, unpaged.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @returns {Promise<readonly string[]>} The ids of the spaces; empty for a guest.
   */
  visibleSpaceIds(organizationId: string, viewer: Viewer): Promise<readonly string[]>;

  /**
   * Method allocateKeys
   *
   * @description
   * Reserves `count` consecutive task numbers under the prefix of a space. The counter row stays
   * locked until the commit and the numbers return with a rollback: call it last in a write, after
   * every validation.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space of the list the tasks are created in.
   * @param {number} count - How many numbers, from 1 to 26.
   * @returns {Promise<KeyAllocation>} The prefix and the first number.
   * @throws {Error} When the space is unknown or the numbers run out (a defect).
   */
  allocateKeys(organizationId: string, spaceId: string, count: number): Promise<KeyAllocation>;
  // #endregion
}
