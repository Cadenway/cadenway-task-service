import { DomainError } from '../task/domain.error.js';

type CustomFieldErrorReason =
  | 'definition-invalid'
  | 'limit-reached'
  | 'not-found'
  | 'position-invalid'
  | 'sprint-points-invalid'
  | 'value-invalid';

/** A refused custom field definition or task value, without user-supplied field values. */
export class CustomFieldError extends DomainError {
  // #region Properties
  /** The rule the operation would break. */
  public readonly reason: CustomFieldErrorReason;
  // #endregion

  // #region Constructor
  /** Identifies the violated rule without including the field name or value. */
  public constructor(reason: CustomFieldErrorReason) {
    super(`The custom field operation was refused (${reason}).`);
    this.reason = reason;
  }
  // #endregion
}
