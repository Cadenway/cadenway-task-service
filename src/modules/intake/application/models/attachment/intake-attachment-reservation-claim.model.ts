import type { IntakeAttachmentReservation } from '../../../domain/aggregates/attachment/intake-attachment-reservation.aggregate.js';

/** A prior allocation for the same publication, draft and idempotency key. */
export interface IntakeAttachmentReservationClaim {
  // #region Properties
  /** Whether the presented declaration matches the original request fingerprint. */
  readonly matchesDeclaration: boolean;

  /** Its stable reservation state. */
  readonly reservation: IntakeAttachmentReservation;
  // #endregion
}
