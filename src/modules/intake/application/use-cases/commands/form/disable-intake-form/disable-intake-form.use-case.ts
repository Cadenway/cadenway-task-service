import {
  currentIntakeForm,
  saveIntakeForm,
  withIntakeRole,
} from '../../../../services/form/intake-form.service.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import type { DisableIntakeFormInput } from './disable-intake-form.input.js';
import type { DisableIntakeFormOutput } from './disable-intake-form.output.js';

/** Revokes the key while preserving the draft, including for an archived list. */
export class DisableIntakeForm {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: IntakeUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Executes the operation in its transaction. */
  public execute(input: DisableIntakeFormInput): Promise<DisableIntakeFormOutput> {
    return this.work.run(input.organizationId, async (store) => {
      const editor = await store.loadEditor(input, true);
      const before = currentIntakeForm(editor);
      const after = withIntakeRole(editor.access, () =>
        before.disable(editor.access, input.expectedVersion),
      );
      await saveIntakeForm(store, input.listId, before, after, editor.form !== null);
      return { version: after.snapshot().version };
    });
  }
  // #endregion
}
