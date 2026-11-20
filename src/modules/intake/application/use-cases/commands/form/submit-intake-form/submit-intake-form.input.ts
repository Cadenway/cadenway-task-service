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

  /** Provides fingerprint. */
  readonly fingerprint: string;
  // #endregion
}
