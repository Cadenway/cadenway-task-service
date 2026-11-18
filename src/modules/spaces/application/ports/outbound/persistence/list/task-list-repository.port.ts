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
  // #endregion
}
