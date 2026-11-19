import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { JobProducer } from '@cadenway/nest-jobs/runtime';
import { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';
import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { TenantSpacesUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/space/tenant-spaces.unit-of-work.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant spacesUnitOfWorkProvider
 *
 * @description
 * Binds the unit of work of the module to the tenant runner of the kit, with the outbox writer
 * that appends the events in the same transaction, the relay woken after the commit, and the job
 * producer of `JobsRuntimeModule`, which enqueues the job of a deletion through the same
 * transaction.
 *
 * @type {FactoryProvider<SpacesUnitOfWork>}
 */
export const spacesUnitOfWorkProvider: FactoryProvider<SpacesUnitOfWork> = {
  provide: SPACES_UNIT_OF_WORK,
  inject: [TenantTransactionRunner, OutboxWriter, OutboxRelay, JobProducer],
  useFactory: (
    runner: TenantTransactionRunner,
    outbox: OutboxWriter,
    relay: OutboxRelay,
    jobs: JobProducer,
  ): SpacesUnitOfWork => new TenantSpacesUnitOfWork(runner, outbox, relay, jobs),
};
