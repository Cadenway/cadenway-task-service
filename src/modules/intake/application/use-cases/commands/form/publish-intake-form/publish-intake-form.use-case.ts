import {
  currentIntakeForm,
  saveIntakeForm,
  withIntakeRole,
} from '../../../../services/form/intake-form.service.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import type { PublishIntakeFormInput } from './publish-intake-form.input.js';
import type { PublishIntakeFormOutput } from './publish-intake-form.output.js';

/** Publishes a validated form with a reserved, never-reused key. */
export class PublishIntakeForm {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: IntakeUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Executes the operation in its transaction. */
  public execute(input: PublishIntakeFormInput): Promise<PublishIntakeFormOutput> {
    return this.work.run(input.organizationId, async (store) => {
      const editor = await store.loadEditor(input, true);
      const before = currentIntakeForm(editor);
      const key =
        before.snapshot().publicKey === null ? await store.reservePublicationKey() : undefined;
      const after = withIntakeRole(editor.access, () =>
        before.publish(editor.access, input.expectedVersion, editor.eligibility, key),
      );
      await saveIntakeForm(store, input.listId, before, after, editor.form !== null);
      return after.snapshot();
    });
  }
  // #endregion
}
