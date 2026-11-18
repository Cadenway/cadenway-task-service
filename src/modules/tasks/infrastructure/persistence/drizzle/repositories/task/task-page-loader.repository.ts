import type { TransactionDatabase } from '@cadenway/nest-common/database';
import type { SQL } from 'drizzle-orm';

import type { ListedTask } from '../../../../../application/models/query/listed-task.model.js';
import type { TaskSummaryView } from '../../../../../application/projections/task/task-summary.projection.js';
import type { RawTaskPageRow } from '../../mappers/query/raw-task-page-row.mapper.js';
import { toListedTask, toTaskPageRow } from '../../mappers/query/task-page-row.mapper.js';
import type { TaskPageRow } from '../../mappers/query/task-page-row.mapper.js';
import { DrizzleTaskCollections } from './task-collections.repository.js';

/**
 * Class DrizzleTaskPageLoader
 *
 * @description
 * Runs a statement that selects a page of task rows (`taskPageColumns` and a `sortValue`) and
 * turns the rows into listed tasks: the page is one statement, then the summaries of its rows are
 * loaded in batches by `DrizzleTaskCollections.summarize`, so a page costs the same number of
 * statements whatever its size. The statement names the organization; the batches filter on the
 * same organization.
 */
export class DrizzleTaskPageLoader {
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
   * Property collections
   *
   * @description
   * The loader of the assignees, labels, counts and parent keys of the rows.
   *
   * @type {DrizzleTaskCollections}
   * @readonly
   */
  private readonly collections: DrizzleTaskCollections;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the loader to a transaction.
   *
   * @param {TransactionDatabase} db - The Drizzle database of the transaction.
   * @constructor
   */
  public constructor(db: TransactionDatabase) {
    this.db = db;
    this.collections = new DrizzleTaskCollections(db);
  }
  // #endregion

  // #region Methods
  /**
   * Method load
   *
   * @description
   * Runs the statement of a page and summarizes its rows.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {SQL} statement - The statement; each row is a `RawTaskPageRow`.
   * @returns {Promise<readonly ListedTask[]>} The tasks in the order of the statement, each with
   * the position after it.
   * @throws {Error} When a stored value is outside its set.
   */
  public async load(organizationId: string, statement: SQL): Promise<readonly ListedTask[]> {
    const result = await this.db.execute<RawTaskPageRow & Record<string, unknown>>(statement);
    const rows: TaskPageRow[] = result.rows.map(toTaskPageRow);
    const summaries: readonly TaskSummaryView[] = await this.collections.summarize(
      organizationId,
      rows,
    );
    return rows.flatMap((row: TaskPageRow, index: number): ListedTask[] => {
      const summary: TaskSummaryView | undefined = summaries[index];
      return summary === undefined ? [] : [toListedTask(row, summary)];
    });
  }
  // #endregion
}
