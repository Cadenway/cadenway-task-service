import { Module } from '@nestjs/common';

import { PurgeIdempotencyReceiptsJob } from './infrastructure/jobs/pg-boss/idempotency/purge-idempotency-receipts.adapter.js';

export { outboxRelayIndicator } from './infrastructure/messaging/outbox/leases/outbox-lease-readiness.adapter.js';

/**
 * Class PlatformModule
 *
 * @description
 * Owner, inside this service, of the tables the service kit stores in the service's own database:
 * the outbox, processed-ids and versions tables of `@cadenway/nest-messaging/outbox` and the
 * `Idempotency-Key` table of `@cadenway/nest-common/database`. Its persistence layer re-exports them
 * so that drizzle-kit, which reads `src/modules/<module>/infrastructure/persistence/*.schema.ts`
 * only, writes them into the migrations of the service.
 *
 * Hosts the service's scheduled retention for expired HTTP receipts. The kit owns the remaining
 * table operations through `DatabaseModule`, `MessagingModule` and `OutboxModule`.
 */
@Module({ providers: [PurgeIdempotencyReceiptsJob] })
export class PlatformModule {}
