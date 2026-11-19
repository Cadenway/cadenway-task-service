/**
 * Interface TransactionClock
 *
 * @description
 * The instant of the current transaction (`now()` of PostgreSQL, truncated to the millisecond as
 * the outbox stamps the `occurredAt` of the events), so that the hourly limit, the stored instants
 * (a millisecond value stores unchanged in a `timestamptz(3)` column), the answers and the events
 * agree with the database. The application never reads the system clock.
 */
export interface TransactionClock {
  // #region Methods
  /**
   * Method now
   *
   * @description
   * Reads the instant of the transaction; the same value for the whole transaction.
   *
   * @returns {Promise<Date>} The instant.
   */
  now(): Promise<Date>;
  // #endregion
}
