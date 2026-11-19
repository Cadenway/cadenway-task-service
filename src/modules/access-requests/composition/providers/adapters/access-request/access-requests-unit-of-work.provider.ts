import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';
import type { FactoryProvider } from '@nestjs/common';

import type { AccessRequestsUnitOfWork } from '../../../../application/ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import { TenantAccessRequestsUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/access-request/tenant-access-requests.unit-of-work.js';
import { ACCESS_REQUESTS_UNIT_OF_WORK } from '../../../tokens/access-request/access-requests-unit-of-work.token.js';

/**
 * Constant accessRequestsUnitOfWorkProvider
 *
 * @description
 * Binds the unit of work of the module to the tenant runner of the kit, with the outbox writer
 * that appends the events in the same transaction and the relay woken after the commit.
 *
 * @type {FactoryProvider<AccessRequestsUnitOfWork>}
 */
export const accessRequestsUnitOfWorkProvider: FactoryProvider<AccessRequestsUnitOfWork> = {
  provide: ACCESS_REQUESTS_UNIT_OF_WORK,
  inject: [TenantTransactionRunner, OutboxWriter, OutboxRelay],
  useFactory: (
    runner: TenantTransactionRunner,
    outbox: OutboxWriter,
    relay: OutboxRelay,
  ): AccessRequestsUnitOfWork => new TenantAccessRequestsUnitOfWork(runner, outbox, relay),
};
