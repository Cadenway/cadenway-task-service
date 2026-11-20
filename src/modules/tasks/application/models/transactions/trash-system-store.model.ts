import type { TrashOrganizationReader } from '../../ports/outbound/persistence/trash/trash-organization-reader.port.js';
import type { TransactionClock } from '../../ports/outbound/time/transaction/transaction-clock.port.js';

/**
 * Interface TrashSystemStore
 *
 * @description
 * What the read-only system transaction of the trash gives: the organizations with entries to
 * erase and the instant of that transaction.
 */
export interface TrashSystemStore {
  // #region Properties
  /** The organizations holding entries to erase. */
  readonly organizations: TrashOrganizationReader;

  /** The instant of the transaction. */
  readonly clock: TransactionClock;
  // #endregion
}
