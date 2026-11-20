import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { JobProducer } from '@cadenway/nest-jobs/runtime';
import { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';
import type { FactoryProvider } from '@nestjs/common';

import { PurgeIntakeContacts } from '../../../../../intake/public/form/purge-intake-contacts.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TenantTasksUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/task/tenant-tasks.unit-of-work.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant tasksUnitOfWorkProvider
 *
 * @description
 * Binds the unit of work of the module to the tenant runner of the kit, with the outbox writer
 * that appends the events in the same transaction, the relay woken after the commit, and the job
 * producer that inserts the jobs of the trash in the same transaction.
 *
 * @type {FactoryProvider<TasksUnitOfWork>}
 */
export const tasksUnitOfWorkProvider: FactoryProvider<TasksUnitOfWork> = {
  provide: TASKS_UNIT_OF_WORK,
  inject: [TenantTransactionRunner, OutboxWriter, OutboxRelay, JobProducer, PurgeIntakeContacts],
  useFactory: (
    runner: TenantTransactionRunner,
    outbox: OutboxWriter,
    relay: OutboxRelay,
    jobs: JobProducer,
    contacts: PurgeIntakeContacts,
  ): TasksUnitOfWork =>
    new TenantTasksUnitOfWork(runner, outbox, relay, jobs, {
      purge: (organizationId, taskIds) => contacts.execute({ organizationId, taskIds }),
    }),
};
