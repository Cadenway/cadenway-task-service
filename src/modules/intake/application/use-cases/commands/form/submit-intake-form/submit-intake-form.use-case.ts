import { IntakeFormError } from '../../../../../domain/errors/form/intake-form.error.js';
import { IntakeAttachmentError } from '../../../../../domain/errors/attachment/intake-attachment.error.js';
import { planIntakeAttachmentClaims } from '../../../../../domain/policies/submission/plan-intake-attachment-claims.policy.js';
import { normalizeIntakeAttachmentIds } from '../../../../../domain/policies/submission/normalize-intake-attachment-ids.policy.js';
import { IntakeSubmissionError } from '../../../../models/form/intake-submission-error.model.js';
import { resolveIntakeTarget } from '../../../../services/form/intake-form.service.js';
import { intakeAttachments } from '../../../../services/attachment/intake-attachment-store.service.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import type { SubmitIntakeFormInput } from './submit-intake-form.input.js';
import type { SubmitIntakeFormOutput } from './submit-intake-form.output.js';

/** Creates the task, separate contact, event facts and replay receipt in one tenant transaction. */
export class SubmitIntakeForm {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(
    private readonly work: IntakeUnitOfWork,
    private readonly now: () => Date = () => new Date(),
  ) {}
  // #endregion

  // #region Methods
  /** Executes the operation in its transaction. */
  public async execute(input: SubmitIntakeFormInput): Promise<SubmitIntakeFormOutput> {
    const target = await resolveIntakeTarget(this.work, input.publicKey);
    return this.work.run(target.organizationId, async (store) => {
      const claim =
        input.idempotencyKey === undefined
          ? { kind: 'acquired' as const }
          : await store.claimSubmission(
              target.listId,
              input.publicKey,
              input.idempotencyKey,
              input.fingerprint,
            );
      const publication = await store.loadPublication(
        target.listId,
        input.publicKey,
        claim.kind !== 'in-progress',
      );
      if (publication === null) throw new IntakeFormError({ kind: 'unavailable' });
      publication.form.publicForm(publication.context);
      if (claim.kind === 'in-progress') throw new IntakeSubmissionError(claim.kind);
      if (claim.kind === 'key-reused') {
        throw new IntakeSubmissionError(claim.kind);
      }
      if (claim.kind === 'replay') return { receipt: claim.receipt };

      const submission = publication.form.submit(publication.context, input.submission);
      const selectedIds = normalizeIntakeAttachmentIds(input.submission.attachmentIds);
      if (
        (input.draftKey !== undefined || selectedIds.length > 0) &&
        input.idempotencyKey === undefined
      ) {
        throw new IntakeAttachmentError('invalid-draft');
      }
      if (selectedIds.length > 0 && input.draftKey === undefined) {
        throw new IntakeAttachmentError('invalid-draft');
      }
      let receipt: string;
      let confirmDraft: (() => void) | undefined;
      if (input.draftKey === undefined) {
        receipt = await store.createTask(target.listId, submission);
      } else {
        const attachments = intakeAttachments(store);
        const draft = await attachments.loadDraft(
          target.listId,
          input.publicKey,
          input.draftKey,
          true,
        );
        if (draft === null) throw new IntakeAttachmentError('unavailable');
        confirmDraft = () => {
          draft.requireOpen(draft.snapshot, this.now());
        };
        confirmDraft();
        const reservations = await attachments.listReservations(draft);
        const plan = planIntakeAttachmentClaims(
          draft,
          draft.snapshot,
          selectedIds,
          reservations,
          this.now(),
        );
        const created = await attachments.createTask(target.listId, submission);
        for (const reservation of plan.selected) {
          await attachments.recordDecision(
            reservation.claim(draft.snapshot, created.taskKey, this.now()),
          );
        }
        for (const reservation of plan.unused) {
          const released = reservation.release(draft.snapshot);
          if (released !== reservation) await attachments.recordDecision(released);
        }
        await attachments.saveDraft(draft.close(draft.snapshot, this.now()));
        receipt = created.receipt;
      }
      if (input.idempotencyKey !== undefined) {
        await store.completeSubmission(
          target.listId,
          input.publicKey,
          input.idempotencyKey,
          input.fingerprint,
          receipt,
        );
      }
      confirmDraft?.();
      return { receipt };
    });
  }
  // #endregion
}
