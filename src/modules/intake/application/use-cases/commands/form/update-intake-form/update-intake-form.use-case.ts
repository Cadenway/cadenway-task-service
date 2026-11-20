import {
  currentIntakeForm,
  saveIntakeForm,
  withIntakeRole,
} from '../../../../services/form/intake-form.service.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import type { UpdateIntakeFormInput } from './update-intake-form.input.js';
import type { UpdateIntakeFormOutput } from './update-intake-form.output.js';

/** Updates the settings under the member, list and form locks. */
export class UpdateIntakeForm {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: IntakeUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Executes the operation in its transaction. */
  public execute(input: UpdateIntakeFormInput): Promise<UpdateIntakeFormOutput> {
    return this.work.run(input.organizationId, async (store) => {
      const patch =
        input.patch.defaultAssigneeId == null
          ? input.patch
          : { ...input.patch, defaultAssigneeId: input.patch.defaultAssigneeId.toLowerCase() };
      const editor = await store.loadEditor(input, true, patch.defaultAssigneeId);
      const before = currentIntakeForm(editor);
      const after = withIntakeRole(editor.access, () =>
        before.configure(editor.access, input.expectedVersion, patch, editor.eligibility),
      );
      await saveIntakeForm(store, input.listId, before, after, editor.form !== null);
      return after.snapshot();
    });
  }
  // #endregion
}
