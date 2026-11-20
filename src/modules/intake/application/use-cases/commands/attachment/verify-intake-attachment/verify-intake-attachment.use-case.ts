import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import { intakeAttachments } from '../../../../services/attachment/intake-attachment-store.service.js';
import type { VerifyIntakeAttachmentInput } from './verify-intake-attachment.input.js';
import type { VerifyIntakeAttachmentOutput } from './verify-intake-attachment.output.js';

/** Applies the exact Storage fact in the tenant transaction of the deduplicated event. */
export class VerifyIntakeAttachment {
  // #region Constructor
  /** Binds the transactional reservation store and clock. */
  public constructor(
    private readonly work: IntakeUnitOfWork,
    private readonly now: () => Date,
  ) {}
  // #endregion

  // #region Methods
  /** Duplicate, unknown and terminal facts leave the reservation unchanged. */
  public execute(input: VerifyIntakeAttachmentInput): Promise<VerifyIntakeAttachmentOutput> {
    return this.work.run(input.organizationId, async (store) => {
      const attachments = intakeAttachments(store);
      const reservation = await attachments.findByIdentity(input.publicationId, input.attachmentId);
      if (reservation === null) return false;
      const verified = reservation.verify(input, this.now());
      if (verified === reservation) return false;
      await attachments.saveReservation(verified);
      return true;
    });
  }
  // #endregion
}
