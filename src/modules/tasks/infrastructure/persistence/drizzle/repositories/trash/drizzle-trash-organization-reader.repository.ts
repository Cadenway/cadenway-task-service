import type { TransactionDatabase } from '@cadenway/nest-common/database';

import type { TrashOrganizationReader } from '../../../../../application/ports/outbound/persistence/trash/trash-organization-reader.port.js';
import { organizationsWithTrashStatement } from '../../mappers/trash/trash-statements.mapper.js';

/**
 * Class DrizzleTrashOrganizationReader
 *
 * @description
 * `TrashOrganizationReader` on `trash_entries`, in a read-only system transaction: row-level
 * security lets it read every organization, so its one statement names the rows it reads (the
 * entries handed over or due) and returns organization ids only, never a row of an entry.
 */
export class DrizzleTrashOrganizationReader implements TrashOrganizationReader {
  // #region Properties
  /**
   * Property db
   *
   * @description
   * The Drizzle database of the system transaction.
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
   * Binds the reader to a system transaction.
   *
   * @param {TransactionDatabase} db - The Drizzle database of the system transaction.
   * @constructor
   */
  public constructor(db: TransactionDatabase) {
    this.db = db;
  }
  // #endregion

  // #region Methods
  /**
   * Method withEntriesToPurge
   *
   * @description
   * Lists the organizations with entries to erase (`organizationsWithTrashStatement`).
   *
   * @param {Date} dueBefore - The latest deletion instant that is due.
   * @param {string | null} after - The last organization of the previous page.
   * @param {number} limit - How many organizations at most.
   * @returns {Promise<readonly string[]>} Their ids, lower-cased, in ascending order.
   */
  public async withEntriesToPurge(
    dueBefore: Date,
    after: string | null,
    limit: number,
  ): Promise<readonly string[]> {
    const result = await this.db.execute<{ organizationId: string }>(
      organizationsWithTrashStatement(dueBefore, after, limit),
    );
    return result.rows.map((row: { organizationId: string }): string =>
      row.organizationId.toLowerCase(),
    );
  }
  // #endregion
}
