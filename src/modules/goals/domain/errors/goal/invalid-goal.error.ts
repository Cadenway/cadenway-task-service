import { DomainError } from './domain.error.js';

/** A rejected goal or result operation, with a reason for the application to map. */
export class InvalidGoalError extends DomainError {
  // #region Constructor
  /** Describes the violated rule without including caller data. */
  public constructor(
    public readonly reason:
      | 'invalid-goal'
      | 'invalid-quarter'
      | 'invalid-date'
      | 'due-date-outside-quarter'
      | 'invalid-result'
      | 'result-limit-reached'
      | 'result-not-found'
      | 'result-patch-invalid'
      | 'invalid-link-measurement',
    message: string,
  ) {
    super(message);
  }
  // #endregion
}
