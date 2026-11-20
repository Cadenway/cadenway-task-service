import type { IntakeAttachmentDeclaration } from './intake-attachment-declaration.model.js';
import type { IntakeAttachmentReservation } from '../../../domain/aggregates/attachment/intake-attachment-reservation.aggregate.js';

/** A prior allocation for the same publication, draft and idempotency key. */
export interface IntakeAttachmentReservationClaim {
  // #region Properties
  /** The exact originally declared content. */
  readonly declaration: IntakeAttachmentDeclaration;

  /** Its stable reservation state. */
  readonly reservation: IntakeAttachmentReservation;
  // #endregion
}
