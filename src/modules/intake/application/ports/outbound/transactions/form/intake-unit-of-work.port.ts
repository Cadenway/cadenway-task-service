import type { IntakeStore } from '../../../../models/form/intake-store.model.js';
import type { IntakeTarget } from '../../../../models/form/intake-target.model.js';

/** Runs each intake operation in the identified tenant's transaction. */
export interface IntakeUnitOfWork {
  // #region Methods
  /** Resolves only the owner of an opaque key through a short, narrowly scoped system transaction.
   * It must not return a draft or applicant data. Unknown and invalid keys return null. */
  resolvePublicKey(key: string): Promise<IntakeTarget | null>;

  /** Starts or joins the tenant transaction, keeping all store effects and outbox writes atomic. */
  run<T>(organizationId: string, work: (store: IntakeStore) => Promise<T>): Promise<T>;

  /** Reads authorization and data in a consistent tenant snapshot. */
  read<T>(organizationId: string, work: (store: IntakeStore) => Promise<T>): Promise<T>;
  // #endregion
}
