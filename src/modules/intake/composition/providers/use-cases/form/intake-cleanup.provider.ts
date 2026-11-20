import { requireOrganizationId } from '@cadenway/nest-common';
import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import type { IntakeCleanupUnitOfWork } from '../../../../application/ports/outbound/transactions/form/intake-cleanup-unit-of-work.port.js';
import { PurgeDeletedListIntake } from '../../../../application/use-cases/commands/form/purge-deleted-list-intake/purge-deleted-list-intake.use-case.js';
import { PurgeIntakeContacts } from '../../../../application/use-cases/commands/form/purge-intake-contacts/purge-intake-contacts.use-case.js';
import { RevokeDeletedListIntake } from '../../../../application/use-cases/commands/form/revoke-deleted-list-intake/revoke-deleted-list-intake.use-case.js';
import { DrizzleIntakeRepository } from '../../../../infrastructure/persistence/drizzle/repositories/form/drizzle-intake.repository.js';

/** Supplies cleanup operations with the tenant transaction the resource owner already opened. */
function withIntakeCleanup<T>(
  operation: new (work: IntakeCleanupUnitOfWork) => T,
): FactoryProvider<T> {
  return {
    provide: operation,
    inject: [TenantTransactionRunner],
    useFactory: (runner: TenantTransactionRunner): T =>
      new operation({
        run(organizationId, work) {
          const tenant = requireOrganizationId().toLowerCase();
          if (organizationId.toLowerCase() !== tenant) {
            throw new Error('Intake cleanup scope does not match the transaction.');
          }
          return runner.run(({ db }) => work(new DrizzleIntakeRepository(db, tenant)));
        },
      }),
  };
}

/** Provides lifecycle cleanup without any dependency on the spaces or tasks modules. */
export const intakeCleanupProviders = [
  withIntakeCleanup(RevokeDeletedListIntake),
  withIntakeCleanup(PurgeDeletedListIntake),
  withIntakeCleanup(PurgeIntakeContacts),
];
