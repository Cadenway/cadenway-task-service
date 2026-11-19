import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';

import type { TransactionClock } from '../../../application/ports/outbound/time/transaction/transaction-clock.port.js';

/**
 * Class PostgresqlTransactionClock
 *
 * @description
 * `TransactionClock` on the clock of the database: `now()` in the transaction of the unit of
 * work, truncated to the millisecond exactly as the outbox writer of `@cadenway/nest-messaging`
 * stamps `occurredAt` (`to_char(now() at time zone 'UTC', '…SS.MS"Z"')`). PostgreSQL gives the same
 * `now()` to every statement of a transaction, so the activity window, the stored instants (a
 * millisecond value stores unchanged in a `timestamptz(3)` column) and the events agree: the
 * `archivedAt` of an archive is the `occurredAt` of its `task.archived.v1`. One store, hence one clock, serves
 * one run: the instant is read once and kept for the run, which joins the transaction of its
 * caller when there is one. A run never reuses the clock of another run.
 */
export class PostgresqlTransactionClock implements TransactionClock {
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
   * Property instant
   *
   * @description
   * The instant of the transaction once read, `null` before.
   *
   * @type {Date | null}
   */
  private instant: Date | null = null;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the clock to a transaction.
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
   * Method now
   *
   * @description
   * Reads the instant of the transaction from the database on the first call, then returns it.
   *
   * @returns {Promise<Date>} The instant, to the millisecond.
   * @throws {Error} When the database answered no valid instant.
   */
  public async now(): Promise<Date> {
    if (this.instant !== null) {
      return this.instant;
    }
    // The instant leaves PostgreSQL as an ISO 8601 text in UTC, so no driver type parser decides how
    // it is read.
    const result = await this.db.execute<{ instant: string }>(sql`
      select to_char(
        now() at time zone 'utc',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ) as instant
    `);
    const text: string | undefined = result.rows[0]?.instant;
    const instant: Date | undefined = text === undefined ? undefined : new Date(text);
    if (instant === undefined || Number.isNaN(instant.getTime())) {
      throw new Error('The database gave no instant for the transaction.');
    }
    this.instant = instant;
    return instant;
  }
  // #endregion
}
