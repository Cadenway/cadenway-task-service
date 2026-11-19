import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { TaskListDraft } from '../../../../../domain/value-objects/list/task-list-draft.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ListAccess } from '../../../../models/access/list-access.model.js';
import type { ListWithGrants } from '../../../../models/access/list-with-grants.model.js';
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
   * Loads a list by its id.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null` when the organization has none with it.
   */
  find(organizationId: string, id: string): Promise<TaskList | null>;

  /**
   * Method lock
   *
   * @description
   * Loads a list by its id and locks it until the end of the transaction, before a change.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null`.
   */
  lock(organizationId: string, id: string): Promise<TaskList | null>;

  /**
   * Method lockMany
   *
   * @description
   * Loads and locks some lists until the end of the transaction, in the order of their ids, so
   * that two batches never wait on each other.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids of the lists.
   * @returns {Promise<TaskList[]>} The lists that exist, by id.
   */
  lockMany(organizationId: string, ids: readonly string[]): Promise<TaskList[]>;

  /**
   * Method update
   *
   * @description
   * Writes a list locked by `lock` or `lockMany` after a change, with its new version: its
   * content, its switch and its archive (`archivedAt`, `archivedBy`, `restoredAt`).
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
   * The first live lists a member has a role on, in sidebar order: spaces by creation instant (id
   * as tie-breaker), then the lists of each space by their position there (`positionInSpaceOf`,
   * id as tie-breaker), at most `limit`. Sprints are lists and are included.
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
  // #endregion
}
