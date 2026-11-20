import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import type { GetIntakeContactInput } from './get-intake-contact.input.js';
import type { GetIntakeContactOutput } from './get-intake-contact.output.js';

/** Reads contact only after checking edit access on the task's current placement. */
export class GetIntakeContact {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: IntakeUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Executes the operation in its transaction. */
  public execute(input: GetIntakeContactInput): Promise<GetIntakeContactOutput> {
    return this.work.read(input.organizationId, async (store) => ({
      contactEmail: await store.readContact(input.actorUserId, input.taskKey),
    }));
  }
  // #endregion
}
