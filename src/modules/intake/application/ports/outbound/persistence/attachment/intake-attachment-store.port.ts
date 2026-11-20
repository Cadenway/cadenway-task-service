import type { IntakeAttachmentDraft } from '../../../../../domain/aggregates/attachment/intake-attachment-draft.aggregate.js';
import type { IntakeAttachmentReservation } from '../../../../../domain/aggregates/attachment/intake-attachment-reservation.aggregate.js';
import type { IntakeSubmission } from '../../../../../domain/value-objects/submission/intake-submission.value-object.js';
import type { IntakeAttachmentDeclaration } from '../../../../models/attachment/intake-attachment-declaration.model.js';
import type { IntakeAttachmentReservationClaim } from '../../../../models/attachment/intake-attachment-reservation-claim.model.js';

/** Operations on a publication and applicant draft within the enclosing tenant transaction. */
export interface IntakeAttachmentStore {
  // #region Methods
  /** Locks the publication's draft identity. Only its digest is persisted. */
  loadDraft(
    listId: string,
    publicKey: string,
    draftKey: string,
    lock: boolean,
  ): Promise<IntakeAttachmentDraft | null>;

  /** Creates and locks a draft for this publication, or returns the concurrent winner. */
  startDraft(
    listId: string,
    publicKey: string,
    draftKey: string,
    now: Date,
  ): Promise<IntakeAttachmentDraft>;

  /** Reads the allocation and checks its request fingerprint under the draft lock. */
  findReservationClaim(
    draft: IntakeAttachmentDraft,
    idempotencyKey: string,
    declaration: IntakeAttachmentDeclaration,
  ): Promise<IntakeAttachmentReservationClaim | null>;

  /** Allocates a UUID v7. */
  newAttachmentId(): Promise<string>;

  /** Returns at most five active draft reservations under the draft lock. */
  listReservations(draft: IntakeAttachmentDraft): Promise<readonly IntakeAttachmentReservation[]>;

  /** Saves the allocation and its idempotency fingerprint in the same transaction. */
  insertReservation(
    reservation: IntakeAttachmentReservation,
    idempotencyKey: string,
    declaration: IntakeAttachmentDeclaration,
  ): Promise<void>;

  /** Resolves a reservation by exact draft and UUID. */
  findReservation(
    draft: IntakeAttachmentDraft,
    attachmentId: string,
    lock: boolean,
  ): Promise<IntakeAttachmentReservation | null>;

  /** Finds a verified-fact target in its signed tenant, including retained terminal states. */
  findByIdentity(
    publicationId: string,
    attachmentId: string,
  ): Promise<IntakeAttachmentReservation | null>;

  /** Saves a verified state without emitting a terminal decision. */
  saveReservation(reservation: IntakeAttachmentReservation): Promise<void>;

  /** Saves the decision and records its released or claimed outbox fact atomically. */
  recordDecision(reservation: IntakeAttachmentReservation): Promise<void>;

  /** Closes the applicant draft after all selected and unused decisions are written. */
  saveDraft(draft: IntakeAttachmentDraft): Promise<void>;

  /** Creates the normal task and private contact using the current transaction. */
  createTask(
    listId: string,
    submission: IntakeSubmission,
  ): Promise<{ readonly receipt: string; readonly taskKey: string }>;
  // #endregion
}
