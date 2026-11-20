import type { IntakeCleanupUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-cleanup-unit-of-work.port.js';
import type { RevokeDeletedListIntakeInput } from './revoke-deleted-list-intake.input.js';

/** Revokes publications when their lists are deleted, preserving the saved drafts. */
export class RevokeDeletedListIntake {
  // #region Constructor
  /** Binds the transaction that already holds the list tombstones. */
  public constructor(private readonly work: IntakeCleanupUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Applies the domain revocation under the form row lock, in stable list order. */
  public execute(input: RevokeDeletedListIntakeInput): Promise<void> {
    return this.work.run(input.organizationId, async (store) => {
      for (const listId of [...new Set(input.listIds)].sort()) {
        const before = await store.findForm(listId, true);
        if (before === null) continue;
        const after = before.revoke();
        if (after !== before) {
          await store.saveForm(listId, after.snapshot(), before.snapshot().version);
        }
      }
    });
  }
  // #endregion
}
