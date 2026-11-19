import { SystemTransactionRunner, TenantTransactionRunner } from '@cadenway/nest-common/database';
import { JobProducer, JobScheduler, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { JobScheduleOptions } from '@cadenway/nest-jobs/runtime';
import { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DeletionLifecycleModule } from '../../../../deletion-lifecycle.module.js';

/** The queues whose workers `DeletionLifecycleModule` registered, in order. */
const workedQueues: string[] = [];

/** The schedules `DeletionLifecycleModule` registered, in order. */
const schedules: { queue: string; cron: string; options: JobScheduleOptions }[] = [];

/**
 * Stands for the global providers of the kit that `DeletionLifecycleModule` and the modules it
 * imports inject: the tenant and system runners, the outbox writer and the relay, which no
 * registration uses, the job producer, and the workers and the scheduler of `@cadenway/nest-jobs`,
 * which record the registrations instead of reaching PostgreSQL.
 */
@Global()
@Module({
  providers: [
    { provide: TenantTransactionRunner, useValue: {} },
    { provide: SystemTransactionRunner, useValue: {} },
    { provide: OutboxWriter, useValue: {} },
    { provide: OutboxRelay, useValue: {} },
    { provide: JobProducer, useValue: {} },
    {
      provide: JobWorkerRegistry,
      useValue: {
        work: (queue: string): Promise<void> => {
          workedQueues.push(queue);
          return Promise.resolve();
        },
      },
    },
    {
      provide: JobScheduler,
      useValue: {
        schedule: (queue: string, cron: string, options: JobScheduleOptions): Promise<void> => {
          schedules.push({ queue, cron, options });
          return Promise.resolve();
        },
        unschedule: (): Promise<void> => Promise.resolve(),
      },
    },
  ],
  exports: [
    TenantTransactionRunner,
    SystemTransactionRunner,
    OutboxWriter,
    OutboxRelay,
    JobProducer,
    JobWorkerRegistry,
    JobScheduler,
  ],
})
class KitDoubles {}

describe('DeletionLifecycleModule composition of the workers and the schedule', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    workedQueues.length = 0;
    schedules.length = 0;
    moduleRef = await Test.createTestingModule({ imports: [KitDoubles, DeletionLifecycleModule] })
      .setLogger({ log: () => undefined, error: () => undefined, warn: () => undefined })
      .compile();
    await moduleRef.init();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('registers one worker on each of the four queues of the deletions and the trash', () => {
    expect([...workedQueues].sort()).toEqual([
      'task.drop-trashed-task-requests',
      'task.purge-trash',
      'task.schedule-trash-purge',
      'task.trash-deleted-tasks',
    ]);
  });

  it('registers the one daily schedule of the purge, at 03:00 UTC, under the key daily', () => {
    expect(schedules).toEqual([
      {
        queue: 'task.schedule-trash-purge',
        cron: '0 3 * * *',
        options: { timeZone: 'UTC', key: 'daily' },
      },
    ]);
  });
});
