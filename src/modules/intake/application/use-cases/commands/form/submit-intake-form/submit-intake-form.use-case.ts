import { IntakeFormError } from '../../../../../domain/errors/form/intake-form.error.js';
import { IntakeSubmissionError } from '../../../../models/form/intake-submission-error.model.js';
import { resolveIntakeTarget } from '../../../../services/form/intake-form.service.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import type { SubmitIntakeFormInput } from './submit-intake-form.input.js';
import type { SubmitIntakeFormOutput } from './submit-intake-form.output.js';

/** Creates the task, separate contact, event facts and replay receipt in one tenant transaction. */
export class SubmitIntakeForm {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: IntakeUnitOfWork) {}
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
      const receipt = await store.createTask(target.listId, submission);
      if (input.idempotencyKey !== undefined) {
        await store.completeSubmission(
          target.listId,
          input.publicKey,
          input.idempotencyKey,
          input.fingerprint,
          receipt,
        );
      }
      return { receipt };
    });
  }
  // #endregion
}
