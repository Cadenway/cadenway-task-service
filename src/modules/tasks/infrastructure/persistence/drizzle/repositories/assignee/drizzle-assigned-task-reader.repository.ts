import type { TransactionDatabase } from '@cadenway/nest-common/database';

import type { ListedTask } from '../../../../../application/models/query/listed-task.model.js';
import type { TaskPosition } from '../../../../../application/models/query/task-position.model.js';
import type { MyTaskState } from '../../../../../application/models/user/my-task-state.model.js';
import type { AssignedTaskReader } from '../../../../../application/ports/outbound/persistence/assignee/assigned-task-reader.port.js';
import { assignedPageStatement } from '../../mappers/assignee/assigned-task-statements.mapper.js';
import { DrizzleTaskPageLoader } from '../task/task-page-loader.repository.js';

/**
 * Class DrizzleAssignedTaskReader
 *
 * @description
 * `AssignedTaskReader` on `task_assignees` and `tasks`, in the transaction of its unit of work,
 * without a lock. The statement starts from `task_assignees_user_index` on the organization and the
 * account, names the organization on both tables and keeps the lists the actor has a role on. A
 * page is that statement plus five at most for its summaries.
 */
export class DrizzleAssignedTaskReader implements AssignedTaskReader {
  // #region Properties
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
    this.pages = new DrizzleTaskPageLoader(db);
  }
  // #endregion

  // #region Methods
  /**
   * Method pageAssignedTo
   *
   * @description
   * Reads a page of the tasks assigned to an account in some lists, by due date (undated last),
   * then `(created_at, id)`. The sort value of a position is the due date or `null`. No list gives
   * no row, without a statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @param {MyTaskState} state - `open` for the tasks not closed, `closed` for `done` and `cancelled`.
   * @param {TaskPosition | null} after - The last task of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ListedTask[]>} The tasks, each with the position after it.
   */
  public async pageAssignedTo(
    organizationId: string,
    userId: string,
    listIds: readonly string[],
    state: MyTaskState,
    after: TaskPosition | null,
    limit: number,
  ): Promise<readonly ListedTask[]> {
    if (listIds.length === 0) {
      return [];
    }
    return this.pages.load(
      organizationId,
      assignedPageStatement(organizationId, userId, listIds, state, after, limit),
    );
  }
  // #endregion
}
