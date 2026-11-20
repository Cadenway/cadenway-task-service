import type { ReportingBatch } from '../../models/reporting/reporting-batch.model.js';

/** Reads keyset batches within the transaction that invokes it. */
export class ReportingBatches {
  // #region Methods
  /** Executes the report operation. */
  public async read<T>(
    read: (afterId: string | null, limit: number) => Promise<ReportingBatch<T>>,
  ): Promise<readonly T[]> {
    const items: T[] = [];
    let after: string | null = null;
    do {
      const batch = await read(after, 500);
      items.push(...batch.items);
      after = batch.next;
    } while (after !== null);
    return items;
  }
  // #endregion
}
