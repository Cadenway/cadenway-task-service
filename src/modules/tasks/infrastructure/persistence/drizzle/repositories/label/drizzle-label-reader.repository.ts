import type { TransactionDatabase } from '@cadenway/nest-common/database';

import type { LabelPosition } from '../../../../../application/models/label/label-position.model.js';
import type { ListedLabel } from '../../../../../application/models/label/listed-label.model.js';
import type { LabelReader } from '../../../../../application/ports/outbound/persistence/label/label-reader.port.js';
import { labelPageStatement } from '../../mappers/label/label-statements.mapper.js';

/**
 * Class DrizzleLabelReader
 *
 * @description
 * `LabelReader` on `task_labels` joined to `tasks`, in the transaction of its unit of work,
 * without a lock: one grouped statement per page, naming the organization on both tables and
 * keeping the tasks of the lists the actor has a role on.
 */
export class DrizzleLabelReader implements LabelReader {
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
   * Binds the reader to a transaction.
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
   * Method pageOfLabels
   *
   * @description
   * Reads a page of the labels of the tasks in some lists, one per `label_key`, by folded key then
   * key. The spelling is the first in code point order among the rows of the visible tasks. No
   * list gives no label, without a statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @param {string | null} search - The text to find, without regard to case or accents; `null`
   * for every label.
   * @param {LabelPosition | null} after - The last label of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ListedLabel[]>} The labels, each with the position after it.
   */
  public async pageOfLabels(
    organizationId: string,
    listIds: readonly string[],
    search: string | null,
    after: LabelPosition | null,
    limit: number,
  ): Promise<readonly ListedLabel[]> {
    if (listIds.length === 0) {
      return [];
    }
    const result = await this.db.execute<{ name: string; sortKey: string; labelKey: string }>(
      labelPageStatement(organizationId, listIds, search, after, limit),
    );
    return result.rows.map(
      (row: { name: string; sortKey: string; labelKey: string }): ListedLabel => ({
        label: { name: row.name },
        position: { sortKey: row.sortKey, labelKey: row.labelKey },
      }),
    );
  }
  // #endregion
}
