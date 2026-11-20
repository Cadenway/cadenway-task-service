import type { CustomFieldRepository } from '../../ports/outbound/persistence/custom-field/custom-field-repository.port.js';
import type { TransactionClock } from '../../ports/outbound/time/transaction/transaction-clock.port.js';

/** Definitions and clock attached to one tenant transaction. */
export interface CustomFieldsStore {
  // #region Properties
  /** State used by this operation. */
  readonly fields: CustomFieldRepository;
  readonly clock: TransactionClock;
  // #endregion
}
