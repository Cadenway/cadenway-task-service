import { IntakeAttachmentError } from '../../../../../domain/errors/attachment/intake-attachment.error.js';
import { IntakeFormError } from '../../../../../domain/errors/form/intake-form.error.js';
import { requireIntakeAttachmentUploadsEnabled } from '../../../../../domain/policies/attachment/require-intake-attachment-uploads-enabled.policy.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import { intakeAttachments } from '../../../../services/attachment/intake-attachment-store.service.js';
import { resolveIntakeTarget } from '../../../../services/form/intake-form.service.js';
import type { ResolveIntakeAttachmentInput } from './resolve-intake-attachment.input.js';
import type { ResolveIntakeAttachmentOutput } from './resolve-intake-attachment.output.js';

/** Authorizes completion without exposing Storage state. */
export class ResolveIntakeAttachment {
  // #region Constructor
  /** Binds a consistent tenant reader and clock. */
  public constructor(
    private readonly work: IntakeUnitOfWork,
    private readonly now: () => Date,
  ) {}
  // #endregion

  // #region Methods
  /** Conceals missing, stale and unrelated reservations alike. */
  public async execute(
    input: ResolveIntakeAttachmentInput,
  ): Promise<ResolveIntakeAttachmentOutput> {
    const target = await resolveIntakeTarget(this.work, input.publicKey);
    return this.work.read(target.organizationId, async (store) => {
      const publication = await store.loadPublication(target.listId, input.publicKey, false);
      if (publication === null) throw new IntakeFormError({ kind: 'unavailable' });
      publication.form.publicForm(publication.context);
      requireIntakeAttachmentUploadsEnabled(publication.form.snapshot().fields.attachments);
      const attachments = intakeAttachments(store);
      const draft = await attachments.loadDraft(
        target.listId,
        input.publicKey,
        input.draftKey,
        false,
      );
      if (draft === null) throw new IntakeAttachmentError('unavailable');
      const now = this.now();
      draft.requireOpen(draft.snapshot, now);
      const reservation = await attachments.findReservation(draft, input.attachmentId, false);
      if (reservation === null) throw new IntakeAttachmentError('unavailable');
      reservation.requireActive(draft.snapshot, this.now());
      const { organizationId, publicationId, attachmentId, expiresAt } = reservation.snapshot;
      return { organizationId, publicationId, attachmentId, expiresAt };
    });
  }
  // #endregion
}
