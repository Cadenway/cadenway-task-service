import { idempotencyKeys } from '@cadenway/nest-common/database';
import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, eq, gt, sql } from 'drizzle-orm';

import type { BulkReceiptScopeRepository } from '../../../../../application/ports/outbound/persistence/bulk/bulk-receipt-scope-repository.port.js';
import { taskBulkReceiptScopes } from '../../schemas/bulk/task-bulk-receipt-scope.schema.js';

/** Reads and writes bulk receipt authorization in the caller's tenant transaction. */
export class DrizzleBulkReceiptScopeRepository implements BulkReceiptScopeRepository {
  // #region Constructor
  /** Binds the database to the caller's transaction. */
  public constructor(private readonly db: TransactionDatabase) {}
  // #endregion

  // #region Methods
  /** Replaces a key's previous scope. The deferred foreign key requires the kit to store its receipt. */
  public async record(
    organizationId: string,
    key: string,
    listIds: readonly string[],
  ): Promise<void> {
    // A refreshed receipt and the cleanup must both lock an existing parent before its scope.
    await this.db
      .select({ id: idempotencyKeys.id })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.organizationId, organizationId), eq(idempotencyKeys.key, key)))
      .for('update');
    await this.db
      .insert(taskBulkReceiptScopes)
      .values({ organizationId, key, listIds: [...listIds] })
      .onConflictDoUpdate({
        target: [taskBulkReceiptScopes.organizationId, taskBulkReceiptScopes.key],
        set: { listIds: [...listIds], receiptAt: sql`now()` },
      });
  }

  /** Requires the kit receipt's body and timestamp to match the recorded authorization scope. */
  public async find(
    organizationId: string,
    key: string,
    serializedResponse: string,
  ): Promise<readonly string[] | null> {
    const [scope] = await this.db
      .select({ listIds: taskBulkReceiptScopes.listIds })
      .from(taskBulkReceiptScopes)
      .innerJoin(
        idempotencyKeys,
        and(
          eq(idempotencyKeys.organizationId, taskBulkReceiptScopes.organizationId),
          eq(idempotencyKeys.key, taskBulkReceiptScopes.key),
          eq(idempotencyKeys.createdAt, taskBulkReceiptScopes.receiptAt),
        ),
      )
      .where(
        and(
          eq(taskBulkReceiptScopes.organizationId, organizationId),
          eq(taskBulkReceiptScopes.key, key),
          gt(idempotencyKeys.expiresAt, sql`now()`),
          sql`${idempotencyKeys.responseBody} = ${serializedResponse}::jsonb`,
        ),
      );
    return scope?.listIds ?? null;
  }
  // #endregion
}
