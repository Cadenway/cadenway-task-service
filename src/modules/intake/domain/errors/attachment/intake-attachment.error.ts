import { DomainError } from '../form/domain.error.js';

type AttachmentFailure =
  | 'invalid-draft'
  | 'unavailable'
  | 'limit-exceeded'
  | 'disabled'
  | 'upload-not-ready'
  | 'invalid-transition'
  | 'invalid-declaration'
  | 'file-too-large'
  | 'idempotency-key-reused';

/** Attachment refusal that carries no applicant key or upload metadata. */
export class IntakeAttachmentError extends DomainError {
  // #region Properties
  /** The violated rule used to map the outcome at the application boundary. */
  public readonly failure: AttachmentFailure;
  // #endregion

  // #region Constructor
  /** Keeps only a reason shared between the public intake attachment operations. */
  public constructor(failure: AttachmentFailure) {
    super(`Intake attachment refused the action: ${failure}.`);
    this.failure = failure;
  }
  // #endregion
}
