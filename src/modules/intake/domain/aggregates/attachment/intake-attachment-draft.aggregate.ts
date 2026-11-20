import { IntakeAttachmentError } from '../../errors/attachment/intake-attachment.error.js';
import { checkedIntakeAttachmentDraftBinding } from '../../policies/attachment/checked-intake-attachment-draft-binding.policy.js';
import { requireIntakeAttachmentDraftBinding } from '../../policies/attachment/require-intake-attachment-draft-binding.policy.js';
import { requireIntakeAttachmentUploadsEnabled } from '../../policies/attachment/require-intake-attachment-uploads-enabled.policy.js';
import type { IntakeAttachmentDraftBinding } from '../../value-objects/attachment/intake-attachment-draft-binding.value-object.js';
import type { IntakeAttachmentDraftSnapshot } from '../../value-objects/attachment/intake-attachment-draft-snapshot.value-object.js';
import {
  INTAKE_ATTACHMENT_DRAFT_LIFETIME_MS,
  MAX_INTAKE_ATTACHMENTS,
} from '../../value-objects/attachment/intake-attachment-limits.value-object.js';
import type { IntakeFormFields } from '../../value-objects/form/intake-form-fields.value-object.js';
import { IntakeAttachmentReservation } from './intake-attachment-reservation.aggregate.js';

/** Publication-bound lease holding up to five active uploads under the P4 public intake contract. */
export class IntakeAttachmentDraft {
  // #region Properties
  /** Checked ownership and fixed lifetime. */
  private readonly state: IntakeAttachmentDraftSnapshot;

  /** Supplies a copy of the lease for persistence. */
  public get snapshot(): IntakeAttachmentDraftSnapshot {
    return {
      ...this.state,
      expiresAt: new Date(this.state.expiresAt),
      closedAt: this.state.closedAt === null ? null : new Date(this.state.closedAt),
    };
  }
  // #endregion

  // #region Constructor
  /** Checks the lease and keeps only opaque ownership and lifecycle data. */
  private constructor(snapshot: IntakeAttachmentDraftSnapshot) {
    const { expiresAt, closedAt } = snapshot;
    const startedAt = expiresAt.getTime() - INTAKE_ATTACHMENT_DRAFT_LIFETIME_MS;
    if (!Number.isFinite(startedAt) || (closedAt !== null && !(closedAt.getTime() >= startedAt))) {
      throw new IntakeAttachmentError('invalid-draft');
    }
    this.state = {
      ...checkedIntakeAttachmentDraftBinding(snapshot),
      expiresAt: new Date(expiresAt),
      closedAt: closedAt === null ? null : new Date(closedAt),
    };
  }
  // #endregion

  // #region Methods
  /** Starts the 30-minute lease alongside its first reservation. */
  public static start(binding: IntakeAttachmentDraftBinding, now: Date): IntakeAttachmentDraft {
    return new IntakeAttachmentDraft({
      ...binding,
      expiresAt: new Date(now.getTime() + INTAKE_ATTACHMENT_DRAFT_LIFETIME_MS),
      closedAt: null,
    });
  }

  /** Reconstitutes the original lease without extending its expiry or clearing closure. */
  public static restore(snapshot: IntakeAttachmentDraftSnapshot): IntakeAttachmentDraft {
    return new IntakeAttachmentDraft(snapshot);
  }

  /** Restricts applicant operations to the resolved publication's live draft. */
  public requireOpen(binding: IntakeAttachmentDraftBinding, now: Date): void {
    requireIntakeAttachmentDraftBinding(this.state, binding);
    if (this.state.closedAt !== null || !(now < this.state.expiresAt)) {
      throw new IntakeAttachmentError('unavailable');
    }
  }

  /** Allocates a slot using the count read while holding the draft lock. */
  public reserve(
    attachmentId: string,
    activeCount: number,
    mode: IntakeFormFields['attachments'],
    now: Date,
  ): IntakeAttachmentReservation {
    this.requireOpen(this.state, now);
    requireIntakeAttachmentUploadsEnabled(mode);
    if (!Number.isSafeInteger(activeCount) || activeCount < 0) {
      throw new IntakeAttachmentError('invalid-draft');
    }
    if (activeCount >= MAX_INTAKE_ATTACHMENTS) throw new IntakeAttachmentError('limit-exceeded');
    return IntakeAttachmentReservation.restore({
      ...this.state,
      attachmentId,
      status: 'reserved',
      taskKey: null,
    });
  }

  /** Closes a draft permanently after submission or cleanup, including an expired draft. */
  public close(binding: IntakeAttachmentDraftBinding, now: Date): IntakeAttachmentDraft {
    requireIntakeAttachmentDraftBinding(this.state, binding);
    if (this.state.closedAt !== null) return this;
    return new IntakeAttachmentDraft({ ...this.state, closedAt: now });
  }
  // #endregion
}
