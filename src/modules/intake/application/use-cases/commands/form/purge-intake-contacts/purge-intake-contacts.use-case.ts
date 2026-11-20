import type { IntakeCleanupUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-cleanup-unit-of-work.port.js';
import type { PurgeIntakeContactsInput } from './purge-intake-contacts.input.js';

/** Removes private contacts in the same transaction as physical task deletion. */
export class PurgeIntakeContacts {
  // #region Constructor
  /** Binds the tenant transaction boundary. */
  public constructor(private readonly work: IntakeCleanupUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Deletes bounded groups, including when a manually erased entry exceeds a purge batch. */
  public execute(input: PurgeIntakeContactsInput): Promise<void> {
    return this.work.run(input.organizationId, async (store) => {
      for (let offset = 0; offset < input.taskIds.length; offset += 500) {
        await store.deleteContacts(input.taskIds.slice(offset, offset + 500));
      }
    });
  }
  // #endregion
}
