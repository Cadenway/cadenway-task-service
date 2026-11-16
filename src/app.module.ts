import { CONFIG, ConfigModule, HealthModule, postgresIndicator } from '@cadenway/nest-common';
import type { HealthIndicator, PostgresProbe } from '@cadenway/nest-common';
import { DATABASE_POOL, DatabaseModule } from '@cadenway/nest-common/database';
import {
  MessagingConnection,
  MessagingModule,
  messagingHealthIndicator,
} from '@cadenway/nest-messaging';
import { PostgresEventDeduplicationModule } from '@cadenway/nest-messaging/consumer/postgres';
import { OutboxModule } from '@cadenway/nest-messaging/outbox';
import { OutboxRelayModule } from '@cadenway/nest-messaging/outbox/relay';
import { OutboxWriterModule } from '@cadenway/nest-messaging/outbox/writer';
import { Module } from '@nestjs/common';
import type { DynamicModule, ModuleMetadata } from '@nestjs/common';

import { appConfigSchema } from './config/app-config.js';
import type { AppConfig } from './config/app-config.js';
import { runtimeConfigSchema } from './config/runtime-config.js';
import type { RuntimeConfig } from './config/runtime-config.js';
import { OUTBOX_RELAY_HEALTH, PlatformModule } from './modules/platform/platform.module.js';

/** Messaging wiring shared by the API and the relay under the same service identity. */
const messaging = MessagingModule.forRootAsync({
  inject: [CONFIG],
  useFactory: (config: RuntimeConfig) => ({
    service: 'task-service',
    servers: config.NATS_URL,
    user: config.NATS_USER,
    password: config.NATS_PASSWORD,
    manageStreams: false,
    deadLetterWorker: false,
  }),
});

const apiHealth = HealthModule.forRootAsync({
  inject: [DATABASE_POOL, MessagingConnection],
  useFactory: (pool: PostgresProbe, connection: MessagingConnection) => ({
    indicators: [postgresIndicator(pool), messagingHealthIndicator(connection)],
    shutdownDelayMs: 0,
  }),
});

function apiImports(
  ...outbox: NonNullable<ModuleMetadata['imports']>
): NonNullable<ModuleMetadata['imports']> {
  return [
    ConfigModule.forRoot({ schema: appConfigSchema, eager: false }),
    DatabaseModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({
        connectionString: config.DATABASE_URL,
        applicationName: 'task-service',
        idempotency: true,
      }),
    }),
    messaging,
    ...outbox,
    apiHealth,
    PlatformModule,
  ];
}

/**
 * Class AppModule
 *
 * @description
 * Root module of the service. `createApplication` of `@cadenway/nest-common` wraps it with the
 * logs, the `application/problem+json` errors, the validation pipe, the internal token guard and
 * the other shared formats; this module declares what the service itself depends on. Importing it
 * reads no configuration: every module below is built when the application is created.
 *
 * - `ConfigModule` (`eager: false`): the environment is validated against `appConfigSchema` when
 *   the application is created and provided as `CONFIG`; an invalid one makes `createApplication`
 *   reject with the `ConfigError`, which `runApplication` writes as one line.
 * - `DatabaseModule`: the pool of this service's own database, opened as the application role of
 *   `DATABASE_URL`, the tenant and system transaction runners, and the `Idempotency-Key`
 *   interceptor for the routes marked `@Idempotent()`. The pool closes on shutdown.
 * - `MessagingModule`: the NATS connection of the `task` user, with the inbox prefix `_INBOX.task`
 *   the broker requires. The creation waits for the first connection, then checks that the
 *   `EVENTS` stream exists: cadenway-ops creates the streams (`manageStreams: false`), and only
 *   notification-service runs the dead-letter worker. The service publishes and consumes nothing
 *   yet, since `@cadenway/contracts` defines no event of its own.
 * - In legacy mode, `OutboxModule` runs the relay in every API replica. In dedicated mode,
 *   this process only installs the outbox writer and PostgreSQL deduplicator.
 * - `HealthModule`: `GET /health/live` answers as soon as the process runs; `GET /health/ready`
 *   answers 503 while PostgreSQL or NATS does not answer within 1 second, and from the start of a
 *   shutdown. Both routes are exempt from the internal token, every other route requires it.
 *   `shutdownDelayMs` is 0: nothing that routes to this internal service reads its readiness.
 *   Callers reach it through the Docker DNS of the `internal` network, which keeps returning a
 *   stopping container until it exits, whatever its health (checked on Docker 28.2), and the GitOps
 *   agent only waits for the new container to be healthy before it stops the old one. A delay would
 *   lengthen every stop, under the 10 second default grace period of Docker, without moving any
 *   request away; set it above the probe interval of a proxy if one ever routes on readiness.
 * - `PlatformModule`: the owner of the kit tables in the migrations of the service.
 *
 * Business modules under `src/modules/` are registered here as they are created.
 */
@Module({})
export class AppModule {
  // #region Methods
  /** Configures the HTTP process with the requested outbox topology. */
  public static forOutboxMode(mode: AppConfig['TASK_SERVICE_OUTBOX_MODE']): DynamicModule {
    return {
      module: AppModule,
      imports:
        mode === 'legacy'
          ? apiImports(OutboxModule.forRoot())
          : apiImports(OutboxWriterModule.forRoot(), PostgresEventDeduplicationModule),
    };
  }
  // #endregion
}

/** The standalone relay, with no application controllers and only loopback probes. */
@Module({
  imports: [
    ConfigModule.forRoot({ schema: runtimeConfigSchema, eager: false }),
    DatabaseModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: RuntimeConfig) => ({
        connectionString: config.DATABASE_URL,
        applicationName: 'task-service-relay',
        poolSize: 4,
      }),
    }),
    messaging,
    OutboxRelayModule.forRoot({ shutdownTimeoutMs: 8_000 }),
    HealthModule.forRootAsync({
      imports: [PlatformModule.forOutboxRelay()],
      inject: [DATABASE_POOL, MessagingConnection, OUTBOX_RELAY_HEALTH],
      useFactory: (
        pool: PostgresProbe,
        connection: MessagingConnection,
        leases: HealthIndicator,
      ) => ({
        indicators: [postgresIndicator(pool), messagingHealthIndicator(connection), leases],
        shutdownDelayMs: 0,
      }),
    }),
  ],
})
export class TaskOutboxRelayModule {}
