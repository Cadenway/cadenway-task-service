import { baseConfigShape, internalTokenVerifierConfigShape } from '@cadenway/nest-common';
import type { BaseConfig, InternalTokenVerifierConfig } from '@cadenway/nest-common';
import { databaseConfigShape } from '@cadenway/nest-common/database';
import type { DatabaseConfig } from '@cadenway/nest-common/database';
import { messagingConfigShape } from '@cadenway/nest-messaging';
import type { MessagingConfig } from '@cadenway/nest-messaging';
import { z } from 'zod';

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
 * - `DATABASE_TRANSACTION_MAX_ATTEMPTS` sets the limit for retryable database transactions.
 * - `NATS_URL`, `NATS_USER`, `NATS_PASSWORD`: `messagingConfigShape` of `@cadenway/nest-messaging`.
 *   `NATS_URL` is required; the user (`task`) and its password are optional for the kit, which
 *   accepts an anonymous local broker, but every broker of Cadenway refuses a connection without
 *   them.
 * - `INTERNAL_TOKEN_AUDIENCE` and `INTERNAL_TOKEN_TRUSTED_ISSUERS`: the `aud` this service accepts
 *   and the public keys of the backends allowed to call it. A hosted environment can pass the
 *   Document issuer's keys separately in `DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS`.
 *
 * - `TRASH_WRITES_ENABLED` (`TrashConfig`): whether the writes that put something in the trash or
 *   make a tombstone are served ("Supprimer la tâche", `DELETE` of a list and of a space, "Vider la
 *   corbeille"); `false` by default.
 *
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is read by `telemetry.ts`, before the application exists.
 *
 * @type {BaseConfig & DatabaseConfig & MessagingConfig & InternalTokenVerifierConfig & TrashConfig}
 */
export type AppConfig = BaseConfig &
  DatabaseConfig &
  MessagingConfig &
  InternalTokenVerifierConfig &
  TrashConfig;

/**
 * Interface TrashConfig
 *
 * @description
 * The switch of the writes of the trash (P3b-1 PR 3). The release that brings the trash reads it
 * everywhere (a task in the trash and a deleted list or space are left out of every collection), but
 * serves the writes that create entries or tombstones only once `TRASH_WRITES_ENABLED` is `true`:
 * while it is `false`, "Supprimer la tâche", `DELETE /internal/v1/lists/{listId}`, `DELETE
 * /internal/v1/spaces/{spaceId}` and "Vider la corbeille" answer `404 http.not-found`, as the
 * release before, which has no such route, does. So no trash entry and no tombstone exists until it is
 * turned on, and this release stays a safe rollback target for the release that turns it on, while the
 * release before 0007 stays one until then (`.claude/rules/migrations.md`: the running version keeps
 * working on the expanded schema). The restoration and the erasure of an entry, the trash page and
 * the jobs are always served: they only act on what is already there.
 */
export interface TrashConfig {
  // #region Properties
  /**
   * Property TRASH_WRITES_ENABLED
   *
   * @description
   * `true` to serve the writes that create trash entries and tombstones; `false` (the default) to
   * answer them as an unknown route.
   *
   * @type {boolean}
   * @readonly
   */
  readonly TRASH_WRITES_ENABLED: boolean;
  // #endregion
}

/** Parses the optional hosted Document key list with the kit's public issuer rules. */
const documentIssuerConfig = z
  .string()
  .trim()
  .optional()
  .transform((input, context): InternalTokenVerifierConfig['INTERNAL_TOKEN_TRUSTED_ISSUERS'] => {
    if (input === undefined || input === '' || input === 'null') return {};
    try {
      const keys: unknown = JSON.parse(`[${input}]`);
      const parsed = internalTokenVerifierConfigShape.INTERNAL_TOKEN_TRUSTED_ISSUERS.safeParse(
        JSON.stringify({ 'document-service': keys }),
      );
      if (parsed.success) return parsed.data;
    } catch {
      // Report the variable without its contents.
    }
    context.addIssue({ code: 'custom', message: 'Expected comma-separated public Ed25519 JWKs.' });
    return z.NEVER;
  });

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
export const appConfigSchema: z.ZodType<AppConfig> = z
  .object({
    ...baseConfigShape,
    ...databaseConfigShape,
    ...messagingConfigShape,
    ...internalTokenVerifierConfigShape,
    DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: documentIssuerConfig,
    TRASH_WRITES_ENABLED: z.stringbool().default(false),
  })
  .transform(({ DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS, ...config }): AppConfig => ({
    ...config,
    INTERNAL_TOKEN_TRUSTED_ISSUERS: {
      ...DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS,
      ...config.INTERNAL_TOKEN_TRUSTED_ISSUERS,
    },
  }));

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
