import type { IntakeAttachmentDraftBinding } from './intake-attachment-draft-binding.value-object.js';

/** Persistable lifetime and ownership of a P4 intake attachment draft. */
export interface IntakeAttachmentDraftSnapshot extends IntakeAttachmentDraftBinding {
  // #region Properties
  /** Fixed end of the 30-minute lease that begins at the first reservation. */
  readonly expiresAt: Date;

  /** Time of permanent closure after submission, revocation or expiry, if closed. */
  readonly closedAt: Date | null;
  // #endregion
}
