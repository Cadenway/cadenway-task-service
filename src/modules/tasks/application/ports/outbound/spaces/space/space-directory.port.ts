import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { KeyAllocation } from '../../../../models/placement/key-allocation.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import type { PlacedList } from '../../../../models/placement/placed-list.model.js';

/**
 * Interface SpaceDirectory
 *
 * @description
 * What the tasks module asks the spaces module: where a list is and the role of an actor on it,
 * the lists an actor has a role on, and the keys of new tasks. Bound to the public operations of
 * spaces, which join the tenant transaction of the use case and decide every role ("Access" of
 * `openapi/public/spaces.yaml`: a guest has a role on the lists shared with them only). The tasks
 * module keeps no copy of a space, a list or a grant.
 */
export interface SpaceDirectory {
  // #region Methods
  /**
   * Method findVisibleList
   *
   * @description
   * Finds a list and its space when the viewer has a role on the list, with that role on the list
   * and on the space; no lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} listId - The list.
   * @returns {Promise<ListPlacement | null>} The list and its space, or `null` when the list is
   * unknown, in another organization or the viewer has no role on it.
   */
  findVisibleList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<ListPlacement | null>;

  /**
   * Method visibleListIds
   *
   * @description
   * Lists every list of the organization the viewer has a role on, unpaged, in the order of the
   * sidebar: the ids a cross-list read filters `tasks.list_id` by.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @returns {Promise<readonly string[]>} The ids of the lists; empty when the viewer has a role on
   * none.
   */
  visibleListIds(organizationId: string, viewer: Viewer): Promise<readonly string[]>;

  /**
   * Method findVisibleSpaceLists
   *
   * @description
   * Lists the lists of a space the viewer has a role on, with that role, when the viewer sees the
   * space, unpaged, in the order of their creation (`created_at`, then id); no lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} spaceId - The space.
   * @returns {Promise<readonly PlacedList[] | null>} The lists, or `null` when the space is
   * unknown, in another organization or not seen by the viewer.
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
   * Lists the sprints the viewer has a role on that are current on a date (start on or before it,
   * end on or after it), by end date then creation, at most `limit`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} today - The date of the caller, `YYYY-MM-DD`.
   * @param {number} limit - How many sprints at most.
   * @returns {Promise<readonly PlacedList[]>} The sprints, each with the role of the viewer.
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
   * Lists the first lists the viewer has a role on in the order of the sidebar: the spaces in the
   * order of their creation, then their lists in the order of their creation, sprints included,
   * at most `limit`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {number} limit - How many lists at most.
   * @returns {Promise<readonly PlacedList[]>} The lists, each with the role of the viewer.
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
