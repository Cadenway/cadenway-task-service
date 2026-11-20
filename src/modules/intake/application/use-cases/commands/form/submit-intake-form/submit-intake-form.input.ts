import type { IntakeSubmissionInput } from '../../../../../domain/value-objects/submission/intake-submission-input.value-object.js';

/** Anonymous request, with a canonical fingerprint supplied by the trusted HTTP boundary. */
export interface SubmitIntakeFormInput {
  // #region Properties
  /** Provides publicKey. */
  readonly publicKey: string;

  /** Provides submission. */
  readonly submission: IntakeSubmissionInput;

  /** Provides idempotencyKey. */
  readonly idempotencyKey?: string;

  /** Optional private applicant draft credential. */
  readonly draftKey?: string;

  /** Canonical submission fingerprint, including the normalized draft and IDs when supplied. */
  readonly fingerprint: string;
  // #endregion
}
