import { SystemTransactionRunner, TenantTransactionRunner } from '@cadenway/nest-common/database';
import { JobScheduler, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import type { FactoryProvider } from '@nestjs/common';

import { EXPIRE_INTAKE_ATTACHMENT_DRAFTS_QUEUE } from '../../../../../../config/job-queues.js';
import { ExpireIntakeAttachmentDrafts } from '../../../../application/use-cases/commands/attachment/expire-intake-attachment-drafts/expire-intake-attachment-drafts.use-case.js';
import { DrizzleExpiredIntakeDrafts } from '../../../../infrastructure/persistence/drizzle/repositories/attachment/drizzle-expired-intake-drafts.repository.js';
import { ExpireIntakeAttachmentDraftsHandler } from '../../../../presentation/jobs/handlers/attachment/expire-intake-attachment-drafts.handler.js';

/** Binds the system sweep and its independently transactional tenant batches. */
export const expireIntakeAttachmentDraftsHandlerProvider: FactoryProvider<ExpireIntakeAttachmentDraftsHandler> =
  {
    provide: ExpireIntakeAttachmentDraftsHandler,
    inject: [
      JobWorkerRegistry,
      JobScheduler,
      SystemTransactionRunner,
      TenantTransactionRunner,
      OutboxWriter,
    ],
    useFactory: (
      workers: JobWorkerRegistry,
      scheduler: JobScheduler,
      system: SystemTransactionRunner,
      tenant: TenantTransactionRunner,
      outbox: OutboxWriter,
    ): ExpireIntakeAttachmentDraftsHandler =>
      new ExpireIntakeAttachmentDraftsHandler(
        workers,
        scheduler,
        new ExpireIntakeAttachmentDrafts(
          new DrizzleExpiredIntakeDrafts(system, tenant, outbox),
          () => new Date(),
        ),
        EXPIRE_INTAKE_ATTACHMENT_DRAFTS_QUEUE,
      ),
  };
