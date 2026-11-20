import { DomainError } from './domain.error.js';

/**
 * A task that has produced an occurrence cannot start another chain (P3b-2 decision 14).
 * The application maps this refusal to `409 recurrence.already-spawned`.
 */
export class RecurrenceAlreadySpawnedError extends DomainError {
  // #region Constructor
  /** Refuses to rearm a consumed predecessor without disclosing its successor. */
  public constructor() {
    super('The task has already produced its next occurrence.');
  }
  // #endregion
}
