import { DomainError } from '../task/domain.error.js';

/** The actor trying to remove a time entry differs from its recorded author. */
export class TimeEntryAuthorRequiredError extends DomainError {
  // #region Constructor
  /** Creates the refusal without identifying either account. */
  public constructor() {
    super('Only the recorded author can remove a time entry.');
  }
  // #endregion
}
