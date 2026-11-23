import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';

import { TenantTaskTemplateUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/template/tenant-task-template.unit-of-work.js';

/** Keeps the task-template store in the existing tenant transaction. */
export const templateUnitOfWorkProvider = {
  provide: TenantTaskTemplateUnitOfWork,
  inject: [TenantTransactionRunner, OutboxWriter, OutboxRelay],
  useFactory: (
    runner: TenantTransactionRunner,
    outbox: OutboxWriter,
    relay: OutboxRelay,
  ): TenantTaskTemplateUnitOfWork => new TenantTaskTemplateUnitOfWork(runner, outbox, relay),
};
