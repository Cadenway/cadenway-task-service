import { SystemTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import { PurgeExpiredIntakeReceipts } from '../../../../application/use-cases/commands/form/purge-expired-intake-receipts/purge-expired-intake-receipts.use-case.js';
import { DrizzleExpiredIntakeReceipts } from '../../../../infrastructure/persistence/drizzle/repositories/form/drizzle-expired-intake-receipts.repository.js';

/** Builds the cleanup operation with one retryable system transaction per batch. */
export const purgeExpiredIntakeReceiptsProvider: FactoryProvider<PurgeExpiredIntakeReceipts> = {
  provide: PurgeExpiredIntakeReceipts,
  inject: [SystemTransactionRunner],
  useFactory: (system: SystemTransactionRunner): PurgeExpiredIntakeReceipts =>
    new PurgeExpiredIntakeReceipts(new DrizzleExpiredIntakeReceipts(system)),
};
