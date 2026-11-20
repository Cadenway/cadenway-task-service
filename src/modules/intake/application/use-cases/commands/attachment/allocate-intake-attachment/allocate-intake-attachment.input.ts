import type { IntakeAttachmentDeclaration } from '../../../../models/attachment/intake-attachment-declaration.model.js';

/** A validated declaration made against an anonymous publication and private draft. */
export interface AllocateIntakeAttachmentInput {
  // #region Properties
  /** Opaque published form key. */
  readonly publicKey: string;

  /** Private applicant draft key, never persisted in clear text. */
  readonly draftKey: string;

  /** Idempotency key for this one upload declaration. */
  readonly idempotencyKey: string;

  /** File metadata validated by the HTTP boundary. */
  readonly declaration: IntakeAttachmentDeclaration;
  // #endregion
}
