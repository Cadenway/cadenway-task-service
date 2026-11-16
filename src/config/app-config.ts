import { internalTokenVerifierConfigShape } from '@cadenway/nest-common';
import type { InternalTokenVerifierConfig } from '@cadenway/nest-common';
import { z } from 'zod';

import { runtimeConfigSchema } from './runtime-config.js';
import type { RuntimeConfig } from './runtime-config.js';

/**
 * Type AppConfig
 *
 * @description
 * Variables the running service reads, validated when the application is created: by `loadConfig`
 * in `main.ts` for the options of `createApplication`, and by `ConfigModule` for the providers that
 * inject `CONFIG`.
 *
 * - `NODE_ENV`, `PORT`, `LOG_LEVEL`, `LOG_PRETTY`: `baseConfigShape` of `@cadenway/nest-common`;
 *   `PORT` is required, the others default to `production`, `info` and `false`.
 * - `DATABASE_URL`: the application role of this service's own database (`task_app`), subject to
 *   row-level security and holding no DDL right.
 * - `NATS_URL`, `NATS_USER`, `NATS_PASSWORD`: `messagingConfigShape` of `@cadenway/nest-messaging`.
 *   `NATS_URL` is required; the user (`task`) and its password are optional for the kit, which
 *   accepts an anonymous local broker, but every broker of Cadenway refuses a connection without
 *   them.
 * - `INTERNAL_TOKEN_AUDIENCE` and `INTERNAL_TOKEN_TRUSTED_ISSUERS`: the `aud` this service accepts
 *   and the public keys of the backends allowed to call it.
 * - `TASK_SERVICE_OUTBOX_MODE`: `legacy` runs the relay in the API process. In `dedicated` mode
 *   the API writes to the outbox and publication is handled by the companion process.
 *
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is read by `telemetry.ts`, before the application exists.
 *
 * @type {RuntimeConfig & InternalTokenVerifierConfig & { readonly TASK_SERVICE_OUTBOX_MODE: 'legacy' | 'dedicated' }}
 */
export type AppConfig = RuntimeConfig &
  InternalTokenVerifierConfig & { readonly TASK_SERVICE_OUTBOX_MODE: 'legacy' | 'dedicated' };

/**
 * Constant appConfigSchema
 *
 * @description
 * Zod schema of `AppConfig`, composed from the shapes of `@cadenway/nest-common` and
 * `@cadenway/nest-messaging` so the names, defaults and validation stay those of the kit. A missing
 * or invalid variable makes `loadConfig` throw a `ConfigError` that names it without printing its
 * value.
 *
 * @type {z.ZodType<AppConfig>}
 */
export const appConfigSchema: z.ZodType<AppConfig> = runtimeConfigSchema.extend({
  ...internalTokenVerifierConfigShape,
  TASK_SERVICE_OUTBOX_MODE: z.enum(['legacy', 'dedicated']).default('legacy'),
});

/**
 * Interface MigrationConfig
 *
 * @description
 * Variable the one-off migration container reads (`node dist/migrate.js`). The running service
 * never reads it: only the migrator role may change the structure of the database.
 */
export interface MigrationConfig {
  // #region Properties
  /**
   * Property MIGRATION_DATABASE_URL
   *
   * @description
   * Connection string of the migrator role (`task_migrator`), which owns the tables and runs the
   * DDL. A secret; cadenway-ops passes it from `TASK_SERVICE_MIGRATION_DATABASE_URL`.
   *
   * @type {string}
   * @readonly
   */
  readonly MIGRATION_DATABASE_URL: string;
  // #endregion
}

/**
 * Constant migrationConfigSchema
 *
 * @description
 * Zod schema of `MigrationConfig`: a `postgres://` or `postgresql://` URL, like `DATABASE_URL`.
 *
 * @type {z.ZodType<MigrationConfig>}
 */
export const migrationConfigSchema: z.ZodType<MigrationConfig> = z.object({
  MIGRATION_DATABASE_URL: z.url({
    protocol: /^postgres(?:ql)?$/u,
    error: 'Expected the postgres:// URL of the migrator role.',
  }),
});
