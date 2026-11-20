import { IntakeAttachmentError } from '../../../../../domain/errors/attachment/intake-attachment.error.js';
import { IntakeFormError } from '../../../../../domain/errors/form/intake-form.error.js';
import { requireIntakeAttachmentUploadsEnabled } from '../../../../../domain/policies/attachment/require-intake-attachment-uploads-enabled.policy.js';
import { requireIntakeAttachmentDeclarationSize } from '../../../../../domain/policies/attachment/require-intake-attachment-declaration-size.policy.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import { intakeAttachments } from '../../../../services/attachment/intake-attachment-store.service.js';
import { resolveIntakeTarget } from '../../../../services/form/intake-form.service.js';
import type { AllocateIntakeAttachmentInput } from './allocate-intake-attachment.input.js';
import type { AllocateIntakeAttachmentOutput } from './allocate-intake-attachment.output.js';

/** Allocates one upload while holding the current publication and draft locks. */
export class AllocateIntakeAttachment {
  // #region Constructor
  /** Binds the tenant unit of work and a deterministic clock. */
  public constructor(
    private readonly work: IntakeUnitOfWork,
    private readonly now: () => Date,
  ) {}
  // #endregion

  // #region Methods
  /** Replays an identical declaration without extending the draft deadline. */
  public async execute(
    input: AllocateIntakeAttachmentInput,
  ): Promise<AllocateIntakeAttachmentOutput> {
    requireIntakeAttachmentDeclarationSize(input.declaration.sizeBytes);
    const target = await resolveIntakeTarget(this.work, input.publicKey);
    return this.work.run(target.organizationId, async (store) => {
      const publication = await store.loadPublication(target.listId, input.publicKey, true);
      if (publication === null) throw new IntakeFormError({ kind: 'unavailable' });
      publication.form.publicForm(publication.context);
      requireIntakeAttachmentUploadsEnabled(publication.form.snapshot().fields.attachments);
      const attachments = intakeAttachments(store);
      const draft = await attachments.startDraft(
        target.listId,
        input.publicKey,
        input.draftKey,
        this.now(),
      );
      const now = this.now();
      draft.requireOpen(draft.snapshot, now);
      const previous = await attachments.findReservationClaim(draft, input.idempotencyKey);
      if (previous !== null) {
        if (
          previous.declaration.fileName !== input.declaration.fileName ||
          previous.declaration.contentType !== input.declaration.contentType ||
          previous.declaration.sizeBytes !== input.declaration.sizeBytes
        )
          throw new IntakeAttachmentError('idempotency-key-reused');
        previous.reservation.requireActive(draft.snapshot, this.now());
        const { organizationId, publicationId, attachmentId, expiresAt } =
          previous.reservation.snapshot;
        return { organizationId, publicationId, attachmentId, expiresAt };
      }
      const reservations = await attachments.listReservations(draft);
      const activeCount = reservations.filter(
        (item) => item.snapshot.status === 'reserved' || item.snapshot.status === 'verified',
      ).length;
      const reservation = draft.reserve(
        await attachments.newAttachmentId(),
        activeCount,
        publication.form.snapshot().fields.attachments ?? 'optional',
        now,
      );
      await attachments.insertReservation(reservation, input.idempotencyKey, input.declaration);
      draft.requireOpen(draft.snapshot, this.now());
      const { organizationId, publicationId, attachmentId, expiresAt } = reservation.snapshot;
      return { organizationId, publicationId, attachmentId, expiresAt };
    });
  }
  // #endregion
}
