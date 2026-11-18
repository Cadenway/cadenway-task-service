import type { TransactionDatabase } from '@cadenway/nest-common/database';

import type { ListedTask } from '../../../../../application/models/query/listed-task.model.js';
import type { TaskFilter } from '../../../../../application/models/query/task-filter.model.js';
import type { TaskGrouping } from '../../../../../application/models/query/task-grouping.model.js';
import type { TaskOrder } from '../../../../../application/models/query/task-order.model.js';
import type { TaskPosition } from '../../../../../application/models/query/task-position.model.js';
import type { TaskQueryReader } from '../../../../../application/ports/outbound/persistence/query/task-query-reader.port.js';
import type { TaskGroupView } from '../../../../../application/projections/query/task-group.projection.js';
import {
  countStatement,
  groupStatement,
  pageStatement,
} from '../../mappers/query/task-query-statements.mapper.js';
import { DrizzleTaskPageLoader } from '../task/task-page-loader.repository.js';

/**
 * Class DrizzleTaskQueryReader
 *
 * @description
 * `TaskQueryReader` on `tasks`, in the transaction of its unit of work, without a lock. Every
 * statement names `organization_id` and `list_id` and applies the same filter, so the page, the
 * total and the groups agree. A page is the statement of `pageStatement` plus five at most for its
 * summaries; the total and the groups are one statement each.
 */
export class DrizzleTaskQueryReader implements TaskQueryReader {
  // #region Properties
  /**
   * Property db
   *
   * @description
   * The Drizzle database of the transaction.
   *
   * @type {TransactionDatabase}
   * @readonly
   */
  private readonly db: TransactionDatabase;

  /**
   * Property pages
   *
   * @description
   * The runner of the statements of a page.
   *
   * @type {DrizzleTaskPageLoader}
   * @readonly
   */
  private readonly pages: DrizzleTaskPageLoader;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the reader to a transaction.
   *
   * @param {TransactionDatabase} db - The Drizzle database of the transaction.
   * @constructor
   */
  public constructor(db: TransactionDatabase) {
    this.db = db;
    this.pages = new DrizzleTaskPageLoader(db);
  }
  // #endregion

  // #region Methods
  /**
   * Method pageOfList
   *
   * @description
   * Reads a page of the tasks of a list that match a filter, in an order, after a position.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @param {TaskFilter} filter - What the tasks must match.
   * @param {TaskOrder} order - The order of the page.
   * @param {TaskPosition | null} after - The last task of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ListedTask[]>} The tasks, each with the position after it.
   */
  public async pageOfList(
    organizationId: string,
    listId: string,
    filter: TaskFilter,
    order: TaskOrder,
    after: TaskPosition | null,
    limit: number,
  ): Promise<readonly ListedTask[]> {
    return this.pages.load(
      organizationId,
      pageStatement(organizationId, listId, filter, order, after, limit),
    );
  }

  /**
   * Method countOfList
   *
   * @description
   * Counts the tasks of a list that match a filter.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @param {TaskFilter} filter - What the tasks must match.
   * @returns {Promise<number>} The count.
   */
  public async countOfList(
    organizationId: string,
    listId: string,
    filter: TaskFilter,
  ): Promise<number> {
    const result = await this.db.execute<{ total: number }>(
      countStatement(organizationId, listId, filter),
    );
    return result.rows[0]?.total ?? 0;
  }

  /**
   * Method groupsOfList
   *
   * @description
   * Counts the tasks of a list that match a filter by status, priority or assignee. For the
   * assignees the group `none` is always returned, with 0 when nobody qualifies.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @param {TaskFilter} filter - What the tasks must match.
   * @param {TaskGrouping} grouping - What the tasks are counted by.
   * @returns {Promise<readonly TaskGroupView[]>} The groups, in any order.
   */
  public async groupsOfList(
    organizationId: string,
    listId: string,
    filter: TaskFilter,
    grouping: TaskGrouping,
  ): Promise<readonly TaskGroupView[]> {
    const result = await this.db.execute<{ value: string; count: number }>(
      groupStatement(organizationId, listId, filter, grouping),
    );
    return result.rows.map((row: { value: string; count: number }): TaskGroupView => ({
      value: row.value,
      count: row.count,
    }));
  }
  // #endregion
}
