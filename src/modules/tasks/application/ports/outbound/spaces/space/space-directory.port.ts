import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { KeyAllocation } from '../../../../models/placement/key-allocation.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import type { PlacedList } from '../../../../models/placement/placed-list.model.js';

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
   * Method findVisibleSpaceLists
   *
   * @description
   * Lists every list of a space when the viewer sees the space, unpaged, in the order of their
   * creation (`created_at`, then id); no lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} spaceId - The space.
   * @returns {Promise<readonly PlacedList[] | null>} The lists, or `null` when the space is
   * unknown, in another organization or not seen by the viewer (a guest sees none).
   */
  findVisibleSpaceLists(
    organizationId: string,
    viewer: Viewer,
    spaceId: string,
  ): Promise<readonly PlacedList[] | null>;

  /**
   * Method currentSprints
   *
   * @description
   * Lists the sprints of the spaces the viewer sees that are current on a date (start on or before
   * it, end on or after it), by end date then creation, at most `limit`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} today - The date of the caller, `YYYY-MM-DD`.
   * @param {number} limit - How many sprints at most.
   * @returns {Promise<readonly PlacedList[]>} The sprints; empty for a guest.
   */
  currentSprints(
    organizationId: string,
    viewer: Viewer,
    today: string,
    limit: number,
  ): Promise<readonly PlacedList[]>;

  /**
   * Method sidebarLists
   *
   * @description
   * Lists the first lists of the spaces the viewer sees in the order of the sidebar: the spaces in
   * the order of their creation, then their lists in the order of their creation, sprints
   * included, at most `limit`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {number} limit - How many lists at most.
   * @returns {Promise<readonly PlacedList[]>} The lists; empty for a guest.
   */
  sidebarLists(
    organizationId: string,
    viewer: Viewer,
    limit: number,
  ): Promise<readonly PlacedList[]>;

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
