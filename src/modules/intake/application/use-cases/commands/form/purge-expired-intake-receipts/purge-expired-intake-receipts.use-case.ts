import type { ExpiredIntakeReceipts } from '../../../../ports/outbound/persistence/form/expired-intake-receipts.port.js';

const BATCH_SIZE = 500;

/** Removes receipts after their replay window without keeping a transaction open between batches. */
export class PurgeExpiredIntakeReceipts {
  // #region Constructor
  /** Binds the system-only cleanup storage. */
  public constructor(private readonly receipts: ExpiredIntakeReceipts) {}
  // #endregion

  // #region Methods
  /** Drains available expired receipts, stopping at a batch boundary when interrupted. */
  public async execute(signal: AbortSignal): Promise<number> {
    let removed = 0;
    let count: number;
    do {
      signal.throwIfAborted();
      count = await this.receipts.deleteBatch(BATCH_SIZE);
      removed += count;
    } while (count === BATCH_SIZE);
    return removed;
  }
  // #endregion
}
