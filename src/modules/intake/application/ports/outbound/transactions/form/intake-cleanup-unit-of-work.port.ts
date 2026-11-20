import type { IntakeForm } from '../../../../../domain/aggregates/form/intake-form.aggregate.js';
import type { IntakeFormConfiguration } from '../../../../../domain/value-objects/form/intake-form-configuration.value-object.js';

/** Storage available to lifecycle operations in their caller's tenant transaction. */
export interface IntakeCleanupUnitOfWork {
  // #region Methods
  /** Joins the active tenant transaction or starts one for the supplied organization. */
  run<T>(
    organizationId: string,
    work: (store: {
      findForm(listId: string, lock: boolean): Promise<IntakeForm | null>;
      saveForm(
        listId: string,
        state: IntakeFormConfiguration,
        version: number | null,
      ): Promise<void>;
      deleteForm(listId: string): Promise<void>;
      deleteContacts(taskIds: readonly string[]): Promise<void>;
    }) => Promise<T>,
  ): Promise<T>;
  // #endregion
}
