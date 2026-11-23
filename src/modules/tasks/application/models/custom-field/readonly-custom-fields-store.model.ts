import type { CustomFieldsStore } from './custom-fields-store.model.js';

/** Field definition reads and the tenant transaction clock. */
export interface ReadonlyCustomFieldsStore {
  // #region Properties
  /** Definition reads in the transaction. */
  readonly fields: Pick<
    CustomFieldsStore['fields'],
    'activeDefinitions' | 'hasNegativeValues' | 'valuesForTasks' | 'valuesForTaskPage'
  >;

  /** Time recorded by the transaction. */
  readonly clock: CustomFieldsStore['clock'];
  // #endregion
}
