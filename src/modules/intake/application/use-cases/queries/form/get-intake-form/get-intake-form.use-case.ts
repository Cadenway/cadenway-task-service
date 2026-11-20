import {
  currentIntakeForm,
  withIntakeRole,
} from '../../../../services/form/intake-form.service.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import type { GetIntakeFormInput } from './get-intake-form.input.js';
import type { GetIntakeFormOutput } from './get-intake-form.output.js';

/** Reads an editor's draft, persisting the initial version on first access. */
export class GetIntakeForm {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: IntakeUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Executes the operation in its transaction. */
  public execute(input: GetIntakeFormInput): Promise<GetIntakeFormOutput> {
    return this.work.run(input.organizationId, async (store) => {
      const editor = await store.loadEditor(input, true);
      const configuration = withIntakeRole(editor.access, () =>
        currentIntakeForm(editor).configuration(editor.access),
      );
      if (editor.form === null) {
        await store.saveForm(input.listId, configuration, null);
      }
      return configuration;
    });
  }
  // #endregion
}
