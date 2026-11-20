import { DomainError } from './domain.error.js';

/**
 * A milestone cannot use the requested status (P3b-2 decision 11).
 * The application maps this refusal to `422 milestone.status-invalid`.
 */
export class MilestoneStatusInvalidError extends DomainError {
  // #region Constructor
  /** Refuses a status outside the milestone workflow. */
  public constructor() {
    super('A milestone can be todo, blocked, done or cancelled.');
  }
  // #endregion
}
