/**
 * Interface TransactionClock
 *
 * @description
 * The instant of the current transaction (`now()` of PostgreSQL, rounded to the millisecond as the
 * columns store it), so that the activity window, the stored instants and the events agree. The
 * application never reads the system clock.
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
