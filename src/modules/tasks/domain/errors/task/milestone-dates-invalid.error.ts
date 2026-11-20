import { DomainError } from './domain.error.js';

/**
 * A milestone requires aligned dates, or two empty dates, and no estimate (P3b-2 decision 11).
 * The application maps a conflicting change to `422 milestone.dates-invalid`.
 */
export class MilestoneDatesInvalidError extends DomainError {
  // #region Constructor
  /** Refuses the fields without echoing their values. */
  public constructor() {
    super('A milestone has equal start and due dates or neither, and no estimate.');
  }
  // #endregion
}
