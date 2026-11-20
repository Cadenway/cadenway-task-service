import { DomainError } from './domain.error.js';

/**
 * The next occurrence would be outside the supported calendar (P3b-2 decision 13).
 * The application maps this refusal to `422 recurrence.date-out-of-range`.
 */
export class RecurrenceDateOutOfRangeError extends DomainError {
  // #region Constructor
  /** Refuses the occurrence without echoing the dates. */
  public constructor() {
    super('The next occurrence has a date outside the supported calendar.');
  }
  // #endregion
}
