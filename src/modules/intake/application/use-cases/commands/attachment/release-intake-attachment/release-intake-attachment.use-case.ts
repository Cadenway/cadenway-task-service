import { IntakeAttachmentError } from '../../../../../domain/errors/attachment/intake-attachment.error.js';
import { IntakeFormError } from '../../../../../domain/errors/form/intake-form.error.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import { intakeAttachments } from '../../../../services/attachment/intake-attachment-store.service.js';
import { resolveIntakeTarget } from '../../../../services/form/intake-form.service.js';
import type { ReleaseIntakeAttachmentInput } from './release-intake-attachment.input.js';
import type { ReleaseIntakeAttachmentOutput } from './release-intake-attachment.output.js';

/** Writes the terminal release and its outbox event together. */
export class ReleaseIntakeAttachment {
  // #region Constructor
  /** Binds the tenant transaction and clock. */
  public constructor(
    private readonly work: IntakeUnitOfWork,
    private readonly now: () => Date,
  ) {}
  // #endregion

  // #region Methods
  /** A repeated release is unchanged while the draft stays eligible. */
  public async execute(
    input: ReleaseIntakeAttachmentInput,
  ): Promise<ReleaseIntakeAttachmentOutput> {
    const target = await resolveIntakeTarget(this.work, input.publicKey);
    await this.work.run(target.organizationId, async (store) => {
      const publication = await store.loadPublication(target.listId, input.publicKey, true);
      if (publication === null) throw new IntakeFormError({ kind: 'unavailable' });
      publication.form.publicForm(publication.context);
      const attachments = intakeAttachments(store);
      const draft = await attachments.loadDraft(
        target.listId,
        input.publicKey,
        input.draftKey,
        true,
      );
      if (draft === null) throw new IntakeAttachmentError('unavailable');
      draft.requireOpen(draft.snapshot, this.now());
      const reservation = await attachments.findReservation(draft, input.attachmentId, true);
      if (reservation === null) throw new IntakeAttachmentError('unavailable');
      draft.requireOpen(draft.snapshot, this.now());
      const released = reservation.release(draft.snapshot);
      if (released !== reservation) await attachments.recordDecision(released);
      draft.requireOpen(draft.snapshot, this.now());
    });
    return undefined;
  }
  // #endregion
}
