import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { TaskListDraft } from '../../../../../domain/value-objects/list/task-list-draft.value-object.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';

/**
 * Interface TaskListRepository
 *
 * @description
 * The lists and sprints of the organization of the tenant transaction of a unit of work: row-level
 * security limits it to that organization, and every method names it again.
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
   * Method update
   *
   * @description
   * Writes a list locked by `lock` after a change, with its new version.
   *
   * @param {TaskList} list - The list after the change.
   * @returns {Promise<void>} Resolves once written.
   */
  update(list: TaskList): Promise<void>;

  /**
   * Method listOfSpace
   *
   * @description
   * The lists of a space in the order of their creation (id as tie-breaker), after `after`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @param {PagePosition | null} after - Where the page starts, `null` for the first page.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<TaskList[]>} The lists, at most `limit`.
   */
  listOfSpace(
    organizationId: string,
    spaceId: string,
    after: PagePosition | null,
    limit: number,
  ): Promise<TaskList[]>;

  /**
   * Method listAllOfSpace
   *
   * @description
   * Every list of a space in the order of their creation (id as tie-breaker), unpaged: a space
   * holds few lists, and the caller needs all of them. It does not check that the viewer sees the
   * space.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @returns {Promise<TaskList[]>} Its lists.
   */
  listAllOfSpace(organizationId: string, spaceId: string): Promise<TaskList[]>;

  /**
   * Method listCurrentSprintsVisibleTo
   *
   * @description
   * The sprints of the spaces a viewer sees (the whole organization and the private ones the viewer
   * owns, none awaiting an owner) whose period holds `today`, bounds included, ordered by end date,
   * then creation instant, then id, at most `limit`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @param {string} today - The calendar date of the caller, `YYYY-MM-DD`.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<TaskList[]>} The sprints, at most `limit`.
   */
  listCurrentSprintsVisibleTo(
    organizationId: string,
    viewerUserId: string,
    today: string,
    limit: number,
  ): Promise<TaskList[]>;

  /**
   * Method listFirstVisibleTo
   *
   * @description
   * The first lists of the spaces a viewer sees, in sidebar order: spaces by creation instant (id as
   * tie-breaker), then the lists of each space by creation instant (id as tie-breaker), at most
   * `limit`. Sprints are lists and are included.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<TaskList[]>} The lists, at most `limit`.
   */
  listFirstVisibleTo(
    organizationId: string,
    viewerUserId: string,
    limit: number,
  ): Promise<TaskList[]>;
  // #endregion
}
