import { IntakeFormError } from '../../../../../domain/errors/form/intake-form.error.js';
import { resolveIntakeTarget } from '../../../../services/form/intake-form.service.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import type { GetPublicIntakeFormInput } from './get-public-intake-form.input.js';
import type { GetPublicIntakeFormOutput } from './get-public-intake-form.output.js';

/** Reads only the anonymous projection after resolving and checking the publication. */
export class GetPublicIntakeForm {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: IntakeUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Executes the operation in its transaction. */
  public async execute(input: GetPublicIntakeFormInput): Promise<GetPublicIntakeFormOutput> {
    const target = await resolveIntakeTarget(this.work, input.publicKey);
    return this.work.read(target.organizationId, async (store) => {
      const publication = await store.loadPublication(target.listId, input.publicKey, false);
      if (publication === null) throw new IntakeFormError({ kind: 'unavailable' });
      return publication.form.publicForm(publication.context);
    });
  }
  // #endregion
}
