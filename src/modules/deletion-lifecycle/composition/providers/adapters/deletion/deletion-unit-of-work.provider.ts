import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import type { DeletionUnitOfWork } from '../../../../application/ports/outbound/transactions/deletion/deletion-unit-of-work.port.js';
import { TenantDeletionUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/deletion/tenant-deletion.unit-of-work.js';
import { DELETION_UNIT_OF_WORK } from '../../../tokens/deletion/deletion-unit-of-work.token.js';

/**
 * Constant deletionUnitOfWorkProvider
 *
 * @description
 * Binds the unit of work of the deletion jobs to the tenant runner of the kit, which the
 * operations of the tasks, spaces and access-requests modules join.
 *
 * @type {FactoryProvider<DeletionUnitOfWork>}
 */
export const deletionUnitOfWorkProvider: FactoryProvider<DeletionUnitOfWork> = {
  provide: DELETION_UNIT_OF_WORK,
  inject: [TenantTransactionRunner],
  useFactory: (runner: TenantTransactionRunner): DeletionUnitOfWork =>
    new TenantDeletionUnitOfWork(runner),
};
