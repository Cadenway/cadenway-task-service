import { runWithOrganizationContext } from '@cadenway/nest-common';
import type { Job, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { z } from 'zod';

import type { NotificationDeliveryAuthorizationInput } from '../../../../application/models/delivery-authorization/notification-delivery-authorization.model.js';

const uuid = z.guid();
const payload = z.strictObject({
  authorizationRequestId: uuid,
  recipientId: uuid,
  subject: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('task-id'), reference: uuid }),
    z.strictObject({ kind: z.literal('task-key'), reference: z.string().min(1).max(120) }),
  ]),
  expiresAt: z.iso.datetime(),
});

/** Restores the tenant of the queued request before producing a visibility decision. */
export class NotificationDeliveryAuthorizationJob implements OnApplicationBootstrap {
  // #region Constructor
  /** Binds the tenant job queue and delivery authorization operation. */
  public constructor(
    private readonly workers: JobWorkerRegistry,
    private readonly queue: string,
    private readonly decide: (
      input: NotificationDeliveryAuthorizationInput,
      signal: AbortSignal,
    ) => Promise<void>,
  ) {}
  // #endregion

  // #region Methods
  /** Registers a worker with a short poll interval for time-limited decisions. */
  public async onApplicationBootstrap(): Promise<void> {
    await this.workers.work(this.queue, (job) => this.handle(job), {
      concurrency: 4,
      pollingIntervalSeconds: 0.5,
    });
  }

  /** Takes the tenant only from the job envelope set by the event transaction. */
  private async handle(job: Job): Promise<void> {
    job.signal.throwIfAborted();
    const organizationId = uuid.parse(job.organizationId).toLowerCase();
    const data = payload.parse(job.payload);
    await runWithOrganizationContext(
      { organizationId, actor: { type: 'system', id: 'task-service' }, role: null, scopes: [] },
      () =>
        this.decide({ ...data, organizationId, expiresAt: new Date(data.expiresAt) }, job.signal),
    );
  }
  // #endregion
}
