import type { SystemTransactionRunner } from '@cadenway/nest-common/database';
import { sql, type SQL } from 'drizzle-orm';

import type { ExpiredIntakeReceipts } from '../../../../../application/ports/outbound/persistence/form/expired-intake-receipts.port.js';
import { intakeSubmissions } from '../../schemas/form/intake-submission.schema.js';

/** Receipt expiry follows the same database clock for replays and cleanup. */
export const intakeReceiptCutoff: SQL = sql`statement_timestamp() - interval '24 hours'`;

/** Deletes only expired receipts across organizations. */
export class DrizzleExpiredIntakeReceipts implements ExpiredIntakeReceipts {
  // #region Constructor
  /** Uses the service's system runner for each batch. */
  public constructor(private readonly system: SystemTransactionRunner) {}
  // #endregion

  // #region Methods
  /** Locks each chosen receipt first so a concurrent renewal can be skipped safely. */
  public deleteBatch(limit: number): Promise<number> {
    return this.system.run(async ({ db }) => {
      const removed = await db.execute(sql`
        with expired as (
          select organization_id, publication_id, key_digest
          from ${intakeSubmissions}
          where created_at <= ${intakeReceiptCutoff}
          order by created_at, organization_id, publication_id, key_digest
          limit ${limit}
          for update skip locked
        )
        delete from ${intakeSubmissions} as receipt
        using expired
        where receipt.organization_id = expired.organization_id
          and receipt.publication_id = expired.publication_id
          and receipt.key_digest = expired.key_digest
      `);
      return removed.rowCount ?? 0;
    });
  }
  // #endregion
}
