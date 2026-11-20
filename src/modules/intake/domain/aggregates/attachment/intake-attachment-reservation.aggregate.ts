import { IntakeAttachmentError } from '../../errors/attachment/intake-attachment.error.js';
import type { IntakeAttachmentDecision } from '../../events/attachment/intake-attachment-decision.event.js';
import { checkedIntakeAttachmentDraftBinding } from '../../policies/attachment/checked-intake-attachment-draft-binding.policy.js';
import { isIntakeAttachmentId } from '../../policies/attachment/is-intake-attachment-id.policy.js';
import { requireIntakeAttachmentDraftBinding } from '../../policies/attachment/require-intake-attachment-draft-binding.policy.js';
import type { IntakeAttachmentDraftBinding } from '../../value-objects/attachment/intake-attachment-draft-binding.value-object.js';
import type { IntakeAttachmentOwnership } from '../../value-objects/attachment/intake-attachment-ownership.value-object.js';
import type { IntakeAttachmentReservationSnapshot } from '../../value-objects/attachment/intake-attachment-reservation-snapshot.value-object.js';

function isTaskKey(key: string | null): key is string {
  return key !== null && key === key.trim() && /^[A-Z]{2,5}-[1-9]\d{0,8}$/.test(key);
}

/** One anonymous slot and its mutually exclusive claim or release in the P4 AsyncAPI contract. */
export class IntakeAttachmentReservation {
  // #region Properties
  /** Checked placement and upload state. */
  private readonly state: IntakeAttachmentReservationSnapshot;

  /** A new terminal fact to be recorded with the transition. Restored rows carry no fact. */
  public readonly decision: IntakeAttachmentDecision | undefined;

  /** Supplies a copy of the state for persistence. */
  public get snapshot(): IntakeAttachmentReservationSnapshot {
    return { ...this.state, expiresAt: new Date(this.state.expiresAt) };
  }

  /** Facts identify a slot by the public operation's trusted tuple. */
  private get ownership(): IntakeAttachmentOwnership {
    const { organizationId, publicationId, attachmentId } = this.state;
    return { organizationId, publicationId, attachmentId };
  }
  // #endregion

  // #region Constructor
  /** Checks the permanent task key and keeps only the metadata owned by Task. */
  private constructor(
    snapshot: IntakeAttachmentReservationSnapshot,
    decision?: IntakeAttachmentDecision,
  ) {
    const { attachmentId, expiresAt, status, taskKey } = snapshot;
    if (
      !isIntakeAttachmentId(attachmentId) ||
      !Number.isFinite(expiresAt.getTime()) ||
      !['reserved', 'verified', 'claimed', 'released'].includes(status) ||
      (status === 'claimed' ? !isTaskKey(taskKey) : taskKey !== null)
    ) {
      throw new IntakeAttachmentError('invalid-transition');
    }
    this.state = {
      ...checkedIntakeAttachmentDraftBinding(snapshot),
      attachmentId: attachmentId.toLowerCase(),
      expiresAt: new Date(expiresAt),
      status,
      taskKey,
    };
    this.decision = decision === undefined ? undefined : Object.freeze(decision);
  }
  // #endregion

  // #region Methods
  /** Reconstitutes a slot from its persisted state without reissuing a decision. */
  public static restore(
    snapshot: IntakeAttachmentReservationSnapshot,
  ): IntakeAttachmentReservation {
    return new IntakeAttachmentReservation(snapshot);
  }

  /** Checks applicant ownership, active status and expiry before public access. */
  public requireActive(binding: IntakeAttachmentDraftBinding, now: Date): void {
    requireIntakeAttachmentDraftBinding(this.state, binding);
    if (
      !(now < this.state.expiresAt) ||
      (this.state.status !== 'reserved' && this.state.status !== 'verified')
    ) {
      throw new IntakeAttachmentError('unavailable');
    }
  }

  /** Applies Storage verification only to the matching live slot. */
  public verify(ownership: IntakeAttachmentOwnership, now: Date): IntakeAttachmentReservation {
    if (
      this.state.organizationId !== ownership.organizationId ||
      this.state.publicationId !== ownership.publicationId ||
      this.state.attachmentId !== ownership.attachmentId.toLowerCase()
    ) {
      throw new IntakeAttachmentError('unavailable');
    }
    if (this.state.status !== 'reserved' || !(now < this.state.expiresAt)) return this;
    return new IntakeAttachmentReservation({ ...this.state, status: 'verified' });
  }

  /** Claims a verified slot for one permanent task key. Exact retries preserve the decision. */
  public claim(
    binding: IntakeAttachmentDraftBinding,
    taskKey: string,
    now: Date,
  ): IntakeAttachmentReservation {
    requireIntakeAttachmentDraftBinding(this.state, binding);
    if (this.state.status === 'claimed' && this.state.taskKey === taskKey) return this;
    this.requireActive(binding, now);
    if (this.state.status === 'reserved') throw new IntakeAttachmentError('upload-not-ready');
    return new IntakeAttachmentReservation(
      { ...this.state, status: 'claimed', taskKey },
      { kind: 'claimed', ...this.ownership, taskKey },
    );
  }

  /** Releases a slot after applicant removal, expiry, revocation or unused draft closure. */
  public release(binding: IntakeAttachmentDraftBinding): IntakeAttachmentReservation {
    requireIntakeAttachmentDraftBinding(this.state, binding);
    if (this.state.status === 'released') return this;
    if (this.state.status === 'claimed') throw new IntakeAttachmentError('unavailable');
    return new IntakeAttachmentReservation(
      { ...this.state, status: 'released' },
      { kind: 'released', ...this.ownership },
    );
  }
  // #endregion
}
