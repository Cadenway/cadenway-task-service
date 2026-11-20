import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { ListActor } from '../../../../../domain/value-objects/list/list-actor.value-object.js';
import type { TaskListDraft } from '../../../../../domain/value-objects/list/task-list-draft.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ListAccess } from '../../../../models/access/list-access.model.js';
import type { ListWithGrants } from '../../../../models/access/list-with-grants.model.js';
import type { TrashListAccess } from '../../../../models/list/trash-list-access.model.js';
import type { ArchivedListPosition } from '../../../../models/page/archived-list-position.model.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';

/**
 * Interface TaskListRepository
 *
 * @description
 * The lists and sprints of the organization of the tenant transaction of a unit of work: row-level
 * security limits it to that organization, and every method names it again. The collections keep
 * the lists a member has a role on ("Access" of `openapi/public/spaces.yaml`), each with the
 * grants of the member, from which the application computes the role with `listRoleOf`. The
 * collections of a space, of the sprints and of the sidebar keep the live lists only (an archived
 * list leaves them, "Lists" of `openapi/public/archives.yaml`); the readings by id, the lean rows
 * of the roles and the archives keep the archived lists too. The lists of a space are placed by
 * `positionInSpaceOf` (their last restoration, or else their creation), the id as tie-breaker.
 * A deleted list, or a list of a deleted space, is a tombstone ("Deletion" of
 * `openapi/public/lists.yaml`): every reading by id, lock before a change and collection leaves it
 * out, as an unknown one; `lockMany`, for the clean-up of a member who left and the erasure of
 * the trash, treats it like any list; only the methods named `IncludingDeleted`, the trash reads,
 * `markDeletedWithSpace`, `listDeletedIdsOfSpace`, `anyOfSpace` and `erase` read or write it on
 * purpose. Several lists are always locked in ascending id (`lockMany`, `lockUndeletedOfSpace`),
 * the order of every locker of several lists.
 */
export interface TaskListRepository {
  // #region Methods
  /**
   * Method insert
   *
   * @description
   * Stores a new list after the other lists of its space; PostgreSQL gives it its id and its
   * creation instant, and version 1.
   *
   * @param {TaskListDraft} draft - The validated list.
   * @returns {Promise<TaskList>} The stored list.
   */
  insert(draft: TaskListDraft): Promise<TaskList>;

  /**
   * Method find
   *
   * @description
   * Loads a list by its id, unless it is deleted.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null` when the organization has none with it
   * or it is deleted.
   */
  find(organizationId: string, id: string): Promise<TaskList | null>;

  /**
   * Method lock
   *
   * @description
   * Loads a list by its id and locks it until the end of the transaction, before a change, unless
   * it is deleted.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null` when unknown or deleted.
   */
  lock(organizationId: string, id: string): Promise<TaskList | null>;

  /**
   * Method lockShared
   *
   * @description
   * Loads a list by its id and locks it `FOR SHARE` until the end of the transaction, unless it is
   * deleted: a deletion of it waits for the caller, which stores something that names it (an
   * access request).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null` when unknown or deleted.
   */
  lockShared(organizationId: string, id: string): Promise<TaskList | null>;

  /**
   * Method lockMany
   *
   * @description
   * Loads and locks some lists until the end of the transaction, in ascending id, so that two
   * lockers never wait on each other; deleted ones are locked like any other: `FOR NO KEY UPDATE`
   * before a change (`update`, the default), `FOR UPDATE` before an erasure (`delete`).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids of the lists.
   * @param {'update' | 'delete'} [mode] - How the caller writes them next, `update` by default.
   * @returns {Promise<TaskList[]>} The lists that exist, by id.
   */
  lockMany(
    organizationId: string,
    ids: readonly string[],
    mode?: 'update' | 'delete',
  ): Promise<TaskList[]>;

  /**
   * Method findManyIncludingDeleted
   *
   * @description
   * Loads some lists by their ids, live, archived or deleted, without lock, in one statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids of the lists.
   * @returns {Promise<TaskList[]>} The lists that exist, in no particular order.
   */
  findManyIncludingDeleted(organizationId: string, ids: readonly string[]): Promise<TaskList[]>;

  /**
   * Method lockUndeletedOfSpace
   *
   * @description
   * Locks `FOR NO KEY UPDATE` every list of a space that is not deleted yet, archived ones
   * included, in ascending id, in one statement: the deletion of the space takes them in the order
   * of every other locker of several lists before `markDeletedWithSpace` writes them. The caller
   * locked the space first, so no list joins or leaves the set meanwhile.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space, locked by the caller.
   * @returns {Promise<string[]>} The ids of the locked lists, ascending.
   */
  lockUndeletedOfSpace(organizationId: string, spaceId: string): Promise<string[]>;

  /**
   * Method update
   *
   * @description
   * Writes a list locked by `lock`, `lockMany` or `lockIncludingDeleted` after a change, with its
   * new version: its content, its switch, its archive (`archivedAt`, `archivedBy`, `restoredAt`)
   * and its tombstone (`deletedAt`, `deletedBy`).
   *
   * @param {TaskList} list - The list after the change.
   * @returns {Promise<void>} Resolves once written.
   */
  update(list: TaskList): Promise<void>;

  /**
   * Method listOfSpaceVisibleTo
   *
   * @description
   * The live lists of a space a member has a role on, in their order in the space
   * (`positionInSpaceOf`, id as tie-breaker), after `after`. It does not check that the member
   * sees the space.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @param {Viewer} viewer - The member and its role.
   * @param {PagePosition | null} after - Where the page starts, `null` for the first page.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<ListWithGrants[]>} The lists, at most `limit`.
   */
  listOfSpaceVisibleTo(
    organizationId: string,
    spaceId: string,
    viewer: Viewer,
    after: PagePosition | null,
    limit: number,
  ): Promise<ListWithGrants[]>;

  /**
   * Method listAllOfSpaceVisibleTo
   *
   * @description
   * Every live list of a space a member has a role on, in their order in the space
   * (`positionInSpaceOf`, id as tie-breaker), unpaged: a space holds few lists, and the caller
   * needs all of them.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @param {Viewer} viewer - The member and its role.
   * @returns {Promise<ListWithGrants[]>} Its lists the member has a role on.
   */
  listAllOfSpaceVisibleTo(
    organizationId: string,
    spaceId: string,
    viewer: Viewer,
  ): Promise<ListWithGrants[]>;

  /**
   * Method listCurrentSprintsVisibleTo
   *
   * @description
   * The live sprints a member has a role on whose period holds `today`, bounds included, ordered
   * by end date, then creation instant, then id, at most `limit`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {string} today - The calendar date of the caller, `YYYY-MM-DD`.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<ListWithGrants[]>} The sprints, at most `limit`.
   */
  listCurrentSprintsVisibleTo(
    organizationId: string,
    viewer: Viewer,
    today: string,
    limit: number,
  ): Promise<ListWithGrants[]>;

  /**
   * Method listFirstVisibleTo
   *
   * @description
   * The first live lists a member has a role on, in sidebar order: spaces by their position in the
   * sidebar (`positionInSidebarOf`, id as tie-breaker), then the lists of each space by their
   * position there (`positionInSpaceOf`, id as tie-breaker), at most `limit`. Sprints are lists and
   * are included.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<ListWithGrants[]>} The lists, at most `limit`.
   */
  listFirstVisibleTo(
    organizationId: string,
    viewer: Viewer,
    limit: number,
  ): Promise<ListWithGrants[]>;

  /**
   * Method listAccessesVisibleTo
   *
   * @description
   * What the role of a member reads of every list of the organization they have a role on,
   * archived ones included, and nothing else of the lists, in the sidebar order of
   * `listFirstVisibleTo`, unpaged: the lists of an organization are few, and the caller filters
   * other collections by them.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @returns {Promise<ListAccess[]>} The lean rows.
   */
  listAccessesVisibleTo(organizationId: string, viewer: Viewer): Promise<ListAccess[]>;

  /**
   * Method listArchivedVisibleTo
   *
   * @description
   * The archived lists of the organization a member has a role on, the most recently archived
   * first (`archivedAt` descending, id descending as tie-breaker), after `after`, at most `limit`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {ArchivedListPosition | null} after - Where the page starts, `null` for the first page.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<ListWithGrants[]>} The archived lists, at most `limit`.
   */
  listArchivedVisibleTo(
    organizationId: string,
    viewer: Viewer,
    after: ArchivedListPosition | null,
    limit: number,
  ): Promise<ListWithGrants[]>;

  /**
   * Method countArchivedVisibleTo
   *
   * @description
   * How many archived lists of the organization a member has a role on, with the condition of
   * `listArchivedVisibleTo`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @returns {Promise<number>} The count.
   */
  countArchivedVisibleTo(organizationId: string, viewer: Viewer): Promise<number>;

  /**
   * Method listVisibleByIds
   *
   * @description
   * Those of some lists of the organization a member has a role on, archived ones included, in no
   * particular order. No id reads nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {readonly string[]} ids - The ids of the lists, UUIDs, few (the caller bounds them).
   * @returns {Promise<ListWithGrants[]>} The lists the member has a role on.
   */
  listVisibleByIds(
    organizationId: string,
    viewer: Viewer,
    ids: readonly string[],
  ): Promise<ListWithGrants[]>;

  /**
   * Method findIncludingDeleted
   *
   * @description
   * Loads a list by its id, live, archived or deleted, without lock: the trash reads the tombstones
   * it restores, to find their space.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null` when the organization has none with it
   * (unknown or erased).
   */
  findIncludingDeleted(organizationId: string, id: string): Promise<TaskList | null>;

  /**
   * Method lockIncludingDeleted
   *
   * @description
   * Loads a list by its id, live, archived or deleted, and locks it until the end of the
   * transaction: `FOR SHARE` to hold it while a task joins it (`share`), `FOR NO KEY UPDATE` before
   * a change or a restoration from the trash (`update`), `FOR UPDATE` before an erasure (`delete`).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @param {'share' | 'update' | 'delete'} mode - How the caller holds or writes it next.
   * @returns {Promise<TaskList | null>} The list, or `null` when unknown or erased.
   */
  lockIncludingDeleted(
    organizationId: string,
    id: string,
    mode: 'share' | 'update' | 'delete',
  ): Promise<TaskList | null>;

  /**
   * Method markDeletedWithSpace
   *
   * @description
   * Deletes with their space every list of it that is not deleted yet, in ONE statement
   * (`TaskList.deleteWithSpace` for each: the instant and the actor of the space, the same
   * version, no event), after the space and those lists were locked (`lockUndeletedOfSpace`):
   * O(lists of the space). A list deleted on its own before keeps its own tombstone.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The deleted space.
   * @param {ListActor} by - Who deleted the space.
   * @param {Date} at - The instant of the deletion of the space.
   * @returns {Promise<number>} How many lists were deleted with it.
   */
  markDeletedWithSpace(
    organizationId: string,
    spaceId: string,
    by: ListActor,
    at: Date,
  ): Promise<number>;

  /**
   * Method listDeletedIdsOfSpace
   *
   * @description
   * The ids of the deleted lists of a space that are not erased yet, by id, without lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @returns {Promise<string[]>} The ids.
   */
  listDeletedIdsOfSpace(organizationId: string, spaceId: string): Promise<string[]>;

  /**
   * Method anyOfSpace
   *
   * @description
   * Whether a space still holds a list row, live, archived or deleted.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @returns {Promise<boolean>} Whether one is left.
   */
  anyOfSpace(organizationId: string, spaceId: string): Promise<boolean>;

  /**
   * Method erase
   *
   * @description
   * Erases a deleted list locked by `lockIncludingDeleted` (`delete`), once its grants are erased
   * and no task references it any more (the caller checks it).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<void>} Resolves once erased.
   * @throws {Error} When the list is not a tombstone, or still holds grants.
   */
  erase(organizationId: string, id: string): Promise<void>;

  /**
   * Method listTrashAccessesVisibleTo
   *
   * @description
   * The lean rows of every list of the organization, live, archived or deleted, in a live or
   * deleted space, on which a member would have a role if neither the list nor its space were
   * deleted ("Who" of `openapi/public/trash.yaml`), with the grants a tombstone keeps, in no
   * particular order, unpaged: O(lists of the organization), as `listAccessesVisibleTo`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @returns {Promise<TrashListAccess[]>} The lean rows.
   */
  listTrashAccessesVisibleTo(organizationId: string, viewer: Viewer): Promise<TrashListAccess[]>;

  /**
   * Method findTrashAccessVisibleTo
   *
   * @description
   * The lean row of one list of the organization, live, archived or deleted, when a member would
   * have a role on it if neither the list nor its space were deleted, without lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {string} id - The id of the list, a UUID.
   * @returns {Promise<TrashListAccess | null>} The lean row, or `null` when the list is unknown,
   * erased, or gives the member no role.
   */
  findTrashAccessVisibleTo(
    organizationId: string,
    viewer: Viewer,
    id: string,
  ): Promise<TrashListAccess | null>;
  // #endregion
}
