import type {
  PurgeTrashBatch,
  PurgeTrashBatchOutput,
} from '../../../../tasks/public/trash/purge-trash-batch.js';
import type { TrashPurgeBatch } from '../../../application/models/trash/trash-purge-batch.model.js';
import type { TrashPurge } from '../../../application/ports/outbound/tasks/trash/trash-purge.port.js';

/**
 * Class TasksTrashPurge
 *
 * @description
 * `TrashPurge` on the public operation `PurgeTrashBatch` of the tasks module, which opens one
 * tenant transaction per batch in the organization context of the purge job.
 */
export class TasksTrashPurge implements TrashPurge {
  // #region Properties
  /**
   * Property purgeTrashBatch
   *
   * @description
   * One batch of the erasure of the trash of an organization.
   *
   * @type {PurgeTrashBatch}
   * @readonly
   */
  private readonly purgeTrashBatch: PurgeTrashBatch;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the tasks module.
   *
   * @param {PurgeTrashBatch} purgeTrashBatch - One batch of the erasure.
   * @constructor
   */
  public constructor(purgeTrashBatch: PurgeTrashBatch) {
    this.purgeTrashBatch = purgeTrashBatch;
  }
  // #endregion

  // #region Methods
  /**
   * Method purgeBatch
   *
   * @description
   * Runs one batch of `PurgeTrashBatch` for the organization.
   *
   * @param {string} organizationId - The organization of the context.
   * @returns {Promise<TrashPurgeBatch>} What the batch did.
   */
  public async purgeBatch(organizationId: string): Promise<TrashPurgeBatch> {
    const output: PurgeTrashBatchOutput = await this.purgeTrashBatch.execute({ organizationId });
    return output.outcome === 'purged'
      ? {
          outcome: 'purged',
          entries: output.entries,
          tasks: output.tasks,
          listsPurged: output.listsPurged,
          spacesPurged: output.spacesPurged,
        }
      : { outcome: 'none-left' };
  }
  // #endregion
}
