import type { IntakeSubmissionIssue } from '../../value-objects/submission/intake-submission-issue.value-object.js';
import { DomainError } from './domain.error.js';

type FormFailure =
  | {
      readonly kind:
        | 'list-not-found'
        | 'role-insufficient'
        | 'list-archived'
        | 'invalid-publication-key'
        | 'unavailable';
    }
  | { readonly kind: 'version-mismatch'; readonly currentVersion: number }
  | {
      readonly kind: 'invalid-settings';
      readonly field: 'title' | 'description' | 'fields' | 'version';
    }
  | {
      readonly kind: 'defaults-invalid';
      readonly field: 'defaultStatus' | 'defaultAssigneeId';
    }
  | { readonly kind: 'invalid-submission'; readonly issues: readonly IntakeSubmissionIssue[] };

/** Form refusals from `openapi/public/intake.yaml` without submitted values or publication keys. */
export class IntakeFormError extends DomainError {
  // #region Properties
  /** The rule that refused the action. */
  public readonly failure: FormFailure;
  // #endregion

  // #region Constructor
  /** Describes a failed rule without interpolating applicant or publication data. */
  public constructor(failure: FormFailure) {
    super(`Intake form refused the action: ${failure.kind}.`);
    this.failure = failure;
  }
  // #endregion
}
