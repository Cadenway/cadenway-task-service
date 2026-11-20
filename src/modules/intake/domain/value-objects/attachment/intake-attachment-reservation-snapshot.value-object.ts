import type { IntakeAttachmentDraftBinding } from './intake-attachment-draft-binding.value-object.js';

/** Persistable ownership and state of an anonymous intake upload. */
export interface IntakeAttachmentReservationSnapshot extends IntakeAttachmentDraftBinding {
  // #region Properties
  /** The attachment UUIDv7 shared by the internal Task and Storage operations. */
  readonly attachmentId: string;

  /** Fixed expiry inherited from the draft. */
  readonly expiresAt: Date;

  /** The terminal states correspond to the mutually exclusive Task decisions in AsyncAPI. */
  readonly status: 'reserved' | 'verified' | 'claimed' | 'released';

  /** Stable task key, present only after a claim. */
  readonly taskKey: string | null;
  // #endregion
}
