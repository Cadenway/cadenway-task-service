import type { IntakeSubmissionInput } from './intake-submission-input.value-object.js';

/** The field and reason of a refusal, without the submitted value (public intake contract). */
export interface IntakeSubmissionIssue {
  // #region Properties
  /** Submission field that failed a rule. */
  readonly field: keyof IntakeSubmissionInput;

  /** Reason the current form refuses the value. */
  readonly reason: 'disabled' | 'required' | 'invalid';
  // #endregion
}
