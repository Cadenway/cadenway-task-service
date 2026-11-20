import type { IntakeAttachmentDraft } from '../../aggregates/attachment/intake-attachment-draft.aggregate.js';
import type { IntakeAttachmentReservation } from '../../aggregates/attachment/intake-attachment-reservation.aggregate.js';
import { IntakeAttachmentError } from '../../errors/attachment/intake-attachment.error.js';
import type { IntakeAttachmentDraftBinding } from '../../value-objects/attachment/intake-attachment-draft-binding.value-object.js';
import { MAX_INTAKE_ATTACHMENTS } from '../../value-objects/attachment/intake-attachment-limits.value-object.js';
import { normalizeIntakeAttachmentIds } from './normalize-intake-attachment-ids.policy.js';

interface ClaimPlan {
  // #region Properties
  /** Verified reservations to claim inside the task creation transaction. */
  readonly selected: readonly IntakeAttachmentReservation[];

  /** Other active draft reservations to release in the same transaction. */
  readonly unused: readonly IntakeAttachmentReservation[];
  // #endregion
}

/**
 * Preflights every selection against one locked live draft before task creation. The P4
 * submission commits its verified claims and releases all other active slots.
 */
export function planIntakeAttachmentClaims(
  draft: IntakeAttachmentDraft,
  binding: IntakeAttachmentDraftBinding,
  selectedIds: readonly string[],
  activeReservations: readonly IntakeAttachmentReservation[],
  now: Date,
): ClaimPlan {
  draft.requireOpen(binding, now);
  const ids = normalizeIntakeAttachmentIds(selectedIds);
  const draftExpiry = draft.snapshot.expiresAt.getTime();
  const byId = new Map<string, IntakeAttachmentReservation>();
  if (activeReservations.length > MAX_INTAKE_ATTACHMENTS) {
    throw new IntakeAttachmentError('invalid-transition');
  }
  for (const reservation of activeReservations) {
    reservation.requireActive(binding, now);
    const { attachmentId, expiresAt } = reservation.snapshot;
    if (byId.has(attachmentId) || expiresAt.getTime() !== draftExpiry) {
      throw new IntakeAttachmentError('invalid-transition');
    }
    byId.set(attachmentId, reservation);
  }
  const selected = ids.map((id) => {
    const reservation = byId.get(id);
    if (reservation === undefined) throw new IntakeAttachmentError('unavailable');
    byId.delete(id);
    return reservation;
  });
  if (selected.some((reservation) => reservation.snapshot.status === 'reserved')) {
    throw new IntakeAttachmentError('upload-not-ready');
  }
  return { selected, unused: [...byId.values()] };
}
