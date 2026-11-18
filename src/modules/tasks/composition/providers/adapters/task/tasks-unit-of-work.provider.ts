import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { JobProducer } from '@cadenway/nest-jobs/runtime';
import { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';
import type { FactoryProvider } from '@nestjs/common';

import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TenantTasksUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/task/tenant-tasks.unit-of-work.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant tasksUnitOfWorkProvider
 *
 * @description
 * Binds the unit of work of the module to the tenant runner of the kit, with the outbox writer
 * that appends the events in the same transaction, the relay woken after the commit and the job
 * producer of `JobsRuntimeModule`, which enqueues through the same transaction.
 *
 * @type {FactoryProvider<TasksUnitOfWork>}
 */
export const tasksUnitOfWorkProvider: FactoryProvider<TasksUnitOfWork> = {
  provide: TASKS_UNIT_OF_WORK,
  inject: [TenantTransactionRunner, OutboxWriter, OutboxRelay, JobProducer],
  useFactory: (
    runner: TenantTransactionRunner,
    outbox: OutboxWriter,
    relay: OutboxRelay,
    jobs: JobProducer,
  ): TasksUnitOfWork => new TenantTasksUnitOfWork(runner, outbox, relay, jobs),
};
