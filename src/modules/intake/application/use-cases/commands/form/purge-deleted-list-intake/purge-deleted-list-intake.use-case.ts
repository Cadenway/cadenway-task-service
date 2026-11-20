import type { IntakeCleanupUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-cleanup-unit-of-work.port.js';
import type { PurgeDeletedListIntakeInput } from './purge-deleted-list-intake.input.js';

/** Removes settings for a physically erased list and retains publication reservations. */
export class PurgeDeletedListIntake {
  // #region Constructor
  /** Binds the caller's tenant transaction. */
  public constructor(private readonly work: IntakeCleanupUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Removes the configuration after the list tombstone is held. */
  public execute(input: PurgeDeletedListIntakeInput): Promise<void> {
    return this.work.run(input.organizationId, (store) => store.deleteForm(input.listId));
  }
  // #endregion
}
