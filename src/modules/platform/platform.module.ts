import type { PostgresProbe } from '@cadenway/nest-common';
import { DATABASE_POOL } from '@cadenway/nest-common/database';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { outboxRelayIndicator } from './infrastructure/messaging/outbox/leases/outbox-lease-readiness.adapter.js';

/** Readiness indicator required by the dedicated outbox relay. */
export const OUTBOX_RELAY_HEALTH: unique symbol = Symbol('OUTBOX_RELAY_HEALTH');

/** Owns the service-kit tables in Task's migrations and the lease readiness check. */
@Module({})
export class PlatformModule {
  // #region Methods
  /** Registers the lease readiness indicator only in the dedicated process. */
  public static forOutboxRelay(): DynamicModule {
    return {
      module: PlatformModule,
      providers: [
        {
          provide: OUTBOX_RELAY_HEALTH,
          inject: [DATABASE_POOL],
          useFactory: (pool: PostgresProbe) => outboxRelayIndicator(pool),
        },
      ],
      exports: [OUTBOX_RELAY_HEALTH],
    };
  }
  // #endregion
}
