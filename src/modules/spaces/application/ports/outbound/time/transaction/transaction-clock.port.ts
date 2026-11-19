/**
 * Interface TransactionClock
 *
 * @description
 * The instant of the current transaction (`now()` of PostgreSQL, rounded to the millisecond as the
 * `timestamptz(3)` columns store it), so that the instant an archive or a restoration stores
 * (`archived_at`, `restored_at`) is the instant of its transaction, the one its event carries as
 * `occurredAt`. The application never reads the system clock.
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
