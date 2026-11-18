import type { TransactionDatabase } from '@cadenway/nest-common/database';

import type { TaskCounter } from '../../../../../application/ports/outbound/persistence/count/task-counter.port.js';
import type { TaskCountsView } from '../../../../../application/projections/count/task-counts.projection.js';
import type { HomeStatsView } from '../../../../../application/projections/user/home-stats.projection.js';
import type { MyTaskCountsView } from '../../../../../application/projections/user/my-task-counts.projection.js';
import {
  countsOfListsStatement,
  homeStatsStatement,
  stateCountsStatement,
} from '../../mappers/count/task-counts.mapper.js';

/**
 * Class DrizzleTaskCounter
 *
 * @description
 * `TaskCounter` on `tasks` and `task_assignees`, in the transaction of its unit of work, without a
 * lock: one statement per method whatever the number of lists. Every statement names
 * `organization_id`.
 */
export class DrizzleTaskCounter implements TaskCounter {
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
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the counter to a transaction.
   *
   * @param {TransactionDatabase} db - The Drizzle database of the transaction.
   * @constructor
   */
  public constructor(db: TransactionDatabase) {
    this.db = db;
  }
  // #endregion

  // #region Methods
  /**
   * Method countsOfLists
   *
   * @description
   * Counts the top-level tasks of lists in one grouped statement; a list without a task is left
   * out. No list gives no count, without a statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @param {string} today - The date of the caller, `YYYY-MM-DD`.
   * @returns {Promise<ReadonlyMap<string, TaskCountsView>>} The counts by list id.
   */
  public async countsOfLists(
    organizationId: string,
    listIds: readonly string[],
    today: string,
  ): Promise<ReadonlyMap<string, TaskCountsView>> {
    const counts = new Map<string, TaskCountsView>();
    if (listIds.length === 0) {
      return counts;
    }
    const result = await this.db.execute<{
      listId: string;
      total: number;
      open: number;
      done: number;
      cancelled: number;
      late: number;
    }>(countsOfListsStatement(organizationId, listIds, today));
    for (const row of result.rows) {
      counts.set(row.listId, {
        total: row.total,
        open: row.open,
        done: row.done,
        cancelled: row.cancelled,
        late: row.late,
      });
    }
    return counts;
  }

  /**
   * Method stateCountsOf
   *
   * @description
   * Counts the tasks assigned to an account in some spaces by tab, subtasks included. No space
   * gives zeros, without a statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {readonly string[]} spaceIds - The spaces the actor sees.
   * @returns {Promise<MyTaskCountsView>} The tasks not closed and the closed ones.
   */
  public async stateCountsOf(
    organizationId: string,
    userId: string,
    spaceIds: readonly string[],
  ): Promise<MyTaskCountsView> {
    if (spaceIds.length === 0) {
      return { open: 0, closed: 0 };
    }
    const result = await this.db.execute<{ open: number; closed: number }>(
      stateCountsStatement(organizationId, userId, spaceIds),
    );
    return { open: result.rows[0]?.open ?? 0, closed: result.rows[0]?.closed ?? 0 };
  }

  /**
   * Method homeStatsOf
   *
   * @description
   * Counts the tasks assigned to an account in some spaces for "Accueil", subtasks included. No
   * space gives zeros, without a statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {readonly string[]} spaceIds - The spaces the actor sees.
   * @param {string} today - The date of the caller, `YYYY-MM-DD`.
   * @returns {Promise<HomeStatsView>} The counters.
   */
  public async homeStatsOf(
    organizationId: string,
    userId: string,
    spaceIds: readonly string[],
    today: string,
  ): Promise<HomeStatsView> {
    if (spaceIds.length === 0) {
      return { assigned: 0, late: 0, dueToday: 0, done: 0 };
    }
    const result = await this.db.execute<{
      assigned: number;
      late: number;
      dueToday: number;
      done: number;
    }>(homeStatsStatement(organizationId, userId, spaceIds, today));
    const row = result.rows[0];
    return {
      assigned: row?.assigned ?? 0,
      late: row?.late ?? 0,
      dueToday: row?.dueToday ?? 0,
      done: row?.done ?? 0,
    };
  }
  // #endregion
}
