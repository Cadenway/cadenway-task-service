import { DeletionStepError } from '../../../../models/deletion/deletion-step-error.model.js';
import type { TrashPurgeBatch } from '../../../../models/trash/trash-purge-batch.model.js';
import type { TrashPurge } from '../../../../ports/outbound/tasks/trash/trash-purge.port.js';
import type { PurgeTrashInput } from './purge-trash.input.js';
import type { PurgeTrashOutput } from './purge-trash.output.js';

/** The counts of a run, as they grow batch after batch. */
interface Progress {
  // #region Properties
  /** The entries erased. */
  entries: number;

  /** The tasks erased. */
  tasks: number;

  /** The tombstones of lists erased. */
  listsPurged: number;

  /** The tombstones of spaces erased. */
  spacesPurged: number;

  /** The batches committed. */
  batches: number;
  // #endregion
}

/**
 * Class PurgeTrash
 *
 * @description
 * The work of a `task.purge-trash` job of one organization ("Erasing" of
 * `openapi/public/trash.yaml`: "erased for good 30 days after its deletion, by a daily job in
 * bounded batches, or before by ... 'Vider la corbeille'"), enqueued by "Vider la corbeille" or by
 * the daily schedule. It runs in the organization context of the job and calls `PurgeTrashBatch`
 * of the tasks module batch after batch, each batch in a tenant transaction of its own: the entries
 * handed over first, then those due, `for update skip locked`, each task with its `task.purged.v1`,
 * then the tombstones of the deleted lists and spaces left without a task ("A deleted list or space
 * is erased with the last of its entries"). Two jobs of one organization share the entries through
 * the skipped locks.
 *
 * It stops only on `none-left`, never on a short batch, and starts no batch once the signal of its
 * attempt aborted. A failed batch rolls back alone: the batches before it stay committed, the
 * attempt fails with a `DeletionStepError` of the step `purge` with the batches committed before
 * it, and the next attempt erases what is left. An erased entry is gone, so nothing is erased
 * twice, and a run that finds nothing left changes nothing.
 */
export class PurgeTrash {
  // #region Properties
  /** The erasure of the trash, one batch per call. */
  private readonly trash: TrashPurge;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the outbound port of the erasure.
   *
   * @param {TrashPurge} trash - The erasure of the trash.
   * @constructor
   */
  public constructor(trash: TrashPurge) {
    this.trash = trash;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Erases the trash of the organization that is due or handed over, one committed batch after
   * another.
   *
   * @param {PurgeTrashInput} input - The organization and the signal of the attempt.
   * @returns {Promise<PurgeTrashOutput>} What the run erased.
   * @throws {DeletionStepError} When a batch fails: it rolls back, the earlier ones stay, and the job
   * is retried.
   * @throws {Error} The reason of the signal once it aborted, as it is.
   */
  public async execute(input: PurgeTrashInput): Promise<PurgeTrashOutput> {
    const progress: Progress = {
      entries: 0,
      tasks: 0,
      listsPurged: 0,
      spacesPurged: 0,
      batches: 0,
    };
    for (;;) {
      input.signal?.throwIfAborted();
      let batch: TrashPurgeBatch;
      try {
        batch = await this.trash.purgeBatch(input.organizationId);
      } catch (error: unknown) {
        throw new DeletionStepError('purge', progress.batches, error);
      }
      if (batch.outcome === 'none-left') {
        return { ...progress };
      }
      progress.batches += 1;
      progress.entries += batch.entries;
      progress.tasks += batch.tasks;
      progress.listsPurged += batch.listsPurged;
      progress.spacesPurged += batch.spacesPurged;
    }
  }
  // #endregion
}
