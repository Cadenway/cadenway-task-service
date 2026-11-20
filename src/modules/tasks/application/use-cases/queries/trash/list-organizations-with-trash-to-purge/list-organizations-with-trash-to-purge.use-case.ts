import { purgeDueBefore } from '../../../../../domain/policies/trash/trash-retention.policy.js';
import type { TrashSystemStore } from '../../../../models/transactions/trash-system-store.model.js';
import type { TrashSystemUnitOfWork } from '../../../../ports/outbound/transactions/trash/trash-system-unit-of-work.port.js';
import type { ListOrganizationsWithTrashToPurgeInput } from './list-organizations-with-trash-to-purge.input.js';
import type { ListOrganizationsWithTrashToPurgeOutput } from './list-organizations-with-trash-to-purge.output.js';

/**
 * Constant MAX_LIMIT
 *
 * @description
 * The largest page.
 *
 * @type {number}
 */
const MAX_LIMIT: number = 1000;

/**
 * Class ListOrganizationsWithTrashToPurge
 *
 * @description
 * Lists the organizations holding a trash entry to erase (an entry handed to the purge by "Vider
 * la corbeille", or one still in the trash whose purge date passed: deleted at or before the
 * transaction instant less 30 days, `purgeDueBefore`), by id after a position: what the daily
 * schedule of the purge (deletion-lifecycle) enqueues one `task.purge-trash` job for. The only
 * cross-organization read of the module: it runs in a read-only system transaction of its own
 * (`TrashSystemUnitOfWork`), never joined to a tenant one, and answers ids only.
 */
export class ListOrganizationsWithTrashToPurge {
  // #region Properties
  /** The read-only system transaction of the query. */
  private readonly unitOfWork: TrashSystemUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the system transaction port.
   *
   * @param {TrashSystemUnitOfWork} unitOfWork - The read-only system transaction.
   * @constructor
   */
  public constructor(unitOfWork: TrashSystemUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads one page of organizations.
   *
   * @param {ListOrganizationsWithTrashToPurgeInput} input - The position and the size of the page.
   * @returns {Promise<ListOrganizationsWithTrashToPurgeOutput>} The organizations.
   * @throws {Error} When the limit is not an integer from 1 to 1,000, a defect of the caller.
   */
  public async execute(
    input: ListOrganizationsWithTrashToPurgeInput,
  ): Promise<ListOrganizationsWithTrashToPurgeOutput> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_LIMIT) {
      throw new Error(`A page of organizations holds 1 to ${String(MAX_LIMIT)} of them.`);
    }
    return this.unitOfWork.runReadOnly(
      async (store: TrashSystemStore): Promise<ListOrganizationsWithTrashToPurgeOutput> => {
        const now: Date = await store.clock.now();
        const organizationIds: readonly string[] = await store.organizations.withEntriesToPurge(
          purgeDueBefore(now),
          input.after === null ? null : input.after.toLowerCase(),
          input.limit,
        );
        return { organizationIds };
      },
    );
  }
  // #endregion
}
