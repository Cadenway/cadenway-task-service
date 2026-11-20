import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ArchivePosition } from '../../../../models/archive/archive-position.model.js';
import type { ArchivedLists } from '../../../../models/placement/archived-lists.model.js';
import type { TrashListLock } from '../../../../models/placement/trash-list-lock.model.js';
import type { DeletedListPurge } from '../../../../models/placement/deleted-list-purge.model.js';
import type { DeletedListRestoration } from '../../../../models/placement/deleted-list-restoration.model.js';
import type { HeldList } from '../../../../models/placement/held-list.model.js';
import type { KeyAllocation } from '../../../../models/placement/key-allocation.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import type { ListRestoration } from '../../../../models/placement/list-restoration.model.js';
import type { LockedDeletedList } from '../../../../models/placement/locked-deleted-list.model.js';
import type { PlacedList } from '../../../../models/placement/placed-list.model.js';
import type { TrashListAccess } from '../../../../models/placement/trash-list-access.model.js';

/**
 * Interface SpaceDirectory
 *
 * @description
 * What the tasks module asks the spaces module: where a list is and the role of an actor on it,
 * the lists an actor has a role on, and the keys of new tasks. Bound to the public operations of
 * spaces, which join the tenant transaction of the use case and decide every role ("Access" of
 * `openapi/public/spaces.yaml`: a guest has a role on the lists shared with them only). The tasks
 * module keeps no copy of a space, a list or a grant. A deleted list or space (a tombstone) is
 * invisible to every method but the seven of the trash (`trashLists`, `findTrashList`,
 * `restoreDeletedList`, `purgeDeletedList`, `holdList`, `lockDeletedList`, `lockTrashLists`).
 */
export interface SpaceDirectory {
  // #region Methods
  /**
   * Method findVisibleList
   *
   * @description
   * Finds a list and its space when the viewer has a role on the list, with that role on the list
   * and on the space, an archived list included (with its archive); no lock.
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
   * Lists every list of the organization the viewer has a role on, archived ones included by default,
   * unpaged, in the order of the sidebar: the ids a cross-list read filters `tasks.list_id` by.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {object} [options] - Optional restrictions by effective edit role and live lifecycle.
   * @returns {Promise<readonly string[]>} The ids of the lists; empty when the viewer has a role on
   * none.
   */
  visibleListIds(
    organizationId: string,
    viewer: Viewer,
    options?: { readonly editOnly?: boolean; readonly liveOnly?: boolean },
  ): Promise<readonly string[]>;

  /**
   * Method findVisibleSpaceLists
   *
   * @description
   * Lists the live lists of a space the viewer has a role on, with that role, when the viewer sees
   * the space, unpaged, in the order of the sidebar; an archived list is left out; no lock.
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
   * Lists the live sprints the viewer has a role on that are current on a date (start on or before
   * it, end on or after it), by end date then creation, at most `limit`; archived ones left out.
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
   * Lists the first live lists the viewer has a role on in the order of the sidebar: the spaces in
   * the order of their creation, then their lists, sprints included, at most `limit`; archived
   * lists left out.
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

  /**
   * Method restoreArchivedList
   *
   * @description
   * Restores the archived list a restored task goes back to ("Restoring any task of an archive
   * restores the whole archive, from its root, to its list, which is restored too when it is
   * archived", "Tasks" of `openapi/public/archives.yaml`), with `edit` on it: the spaces module
   * locks the list `FOR NO KEY UPDATE` (after the tasks the caller locked), restores it at the end
   * of its space and appends `list.unarchived.v1` by the actor, in the transaction of the caller.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} listId - The list.
   * @returns {Promise<ListRestoration>} `restored`, `not-archived`, `not-found` or
   * `role-insufficient` with the role of the actor; a refusal writes nothing.
   */
  restoreArchivedList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<ListRestoration>;

  /**
   * Method archivedLists
   *
   * @description
   * Reads a page of the archived lists the viewer has a role on, the most recently archived first
   * (`archived_at desc, id desc`), after a position, and their number; no lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {ArchivePosition | null} after - The last list of the previous page, `null` for the
   * first.
   * @param {number} limit - How many lists at most.
   * @returns {Promise<ArchivedLists>} The lists, each with the role of the viewer, and the total.
   */
  archivedLists(
    organizationId: string,
    viewer: Viewer,
    after: ArchivePosition | null,
    limit: number,
  ): Promise<ArchivedLists>;

  /**
   * Method findVisibleLists
   *
   * @description
   * Finds the lists among some ids the viewer has a role on, archived ones included, with that
   * role; no lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {readonly string[]} listIds - The lists, 100 at most.
   * @returns {Promise<readonly PlacedList[]>} The lists found, in no particular order.
   * @throws {Error} With more than 100 ids, a defect.
   */
  findVisibleLists(
    organizationId: string,
    viewer: Viewer,
    listIds: readonly string[],
  ): Promise<readonly PlacedList[]>;

  /**
   * Method trashLists
   *
   * @description
   * Lists every list of the organization, live, archived or deleted, in a live or deleted space,
   * on which the viewer has a role as if neither the list nor its space were deleted, with that
   * role, in no particular order; no lock. The module keeps those its own threshold accepts
   * (`canWriteTasksOf`: the lists whose entries the viewer may see, restore and erase, "Who" of
   * `openapi/public/trash.yaml`).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @returns {Promise<readonly TrashListAccess[]>} The lists with the role of the viewer.
   */
  trashLists(organizationId: string, viewer: Viewer): Promise<readonly TrashListAccess[]>;

  /**
   * Method findTrashList
   *
   * @description
   * Finds a list, live, archived or deleted, with the role the viewer would have on it as if
   * neither the list nor its space were deleted; no lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} listId - The list.
   * @returns {Promise<TrashListAccess | null>} The list and the role, or `null` for an unknown or
   * erased list, or one the viewer would have no role on.
   */
  findTrashList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<TrashListAccess | null>;

  /**
   * Method restoreDeletedList
   *
   * @description
   * Hands the list of a trash entry being restored to the spaces module, which locks its space
   * then the list `FOR NO KEY UPDATE`, decides the role of the viewer on the locked rows as if not
   * deleted (`edit` needed), and brings back the space and the list when deleted, appending
   * `space.restored.v1` and `list.restored.v1` (actor the viewer). A live list and space answer
   * `restored` and write nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {string} listId - The list.
   * @returns {Promise<DeletedListRestoration>} What came back, or the refusal.
   */
  restoreDeletedList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<DeletedListRestoration>;

  /**
   * Method purgeDeletedList
   *
   * @description
   * Hands a list no task row references any more to the spaces module, which locks it `FOR
   * UPDATE` and erases it when deleted (its grants, the row), then its deleted space once no list
   * of it is left (its grants, the row; its prefix stays reserved). A live list is left alone.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @returns {Promise<DeletedListPurge>} What was erased.
   */
  purgeDeletedList(organizationId: string, listId: string): Promise<DeletedListPurge>;

  /**
   * Method holdList
   *
   * @description
   * Locks a list `FOR SHARE` until the commit, after the task locks and before the key counter:
   * a deletion of the list either committed before and is seen here, or waits for this
   * transaction.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @returns {Promise<HeldList>} Whether the list is live, deleted (with who deleted it) or
   * gone.
   */
  holdList(organizationId: string, listId: string): Promise<HeldList>;

  /**
   * Method lockDeletedList
   *
   * @description
   * Locks a deleted list for a change that decides on its tombstone (`LockDeletedList` of the
   * spaces module): reads the list without a lock; a live or unknown list answers at once without
   * any lock; a deleted one has its space locked `FOR NO KEY UPDATE`, then the list `FOR UPDATE`
   * (which conflicts with the `FOR SHARE` of `holdList` and of a deletion batch), and is read again
   * under the lock until the commit. A restoration of an entry decides under it whether the
   * deletion job of the list is done, and an erasure whether the tombstone goes.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @returns {Promise<LockedDeletedList>} `deleted` under the lock, `live` or `not-found`.
   */
  lockDeletedList(organizationId: string, listId: string): Promise<LockedDeletedList>;

  /**
   * Method lockTrashLists
   *
   * @description
   * Locks the lists of trash entries, live or deleted, in the global lock order, after the entries
   * and the tasks the caller locked (`LockTrashLists` of the spaces module): their spaces in
   * `(created_at, id)` order, then the lists in ascending list id, read again under the locks,
   * with the role of the viewer on each read under them. `hold` takes `FOR SHARE` on both (a
   * revocation, a change of visibility or a deletion either committed before and is seen, or waits
   * for the commit), for "Vider la corbeille"; `erase` takes the spaces `FOR NO KEY UPDATE` and
   * the lists `FOR UPDATE`, for an erasure, which then decides under them whether each tombstone
   * goes, a deletion committed meanwhile included.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @param {'hold' | 'erase'} mode - How the caller holds them.
   * @param {Viewer | null} viewer - The member whose role is read again, `null` for the service.
   * @param {readonly string[]} [additionalSpaceIds] - Additional spaces to hold in the same order.
   * @returns {Promise<readonly TrashListLock[]>} What the lock found for each list.
   */
  lockTrashLists(
    organizationId: string,
    listIds: readonly string[],
    mode: 'hold' | 'erase',
    viewer: Viewer | null,
    additionalSpaceIds?: readonly string[],
  ): Promise<readonly TrashListLock[]>;
  // #endregion
}
