import {
  baseConfigShape,
  internalTokenSignerConfigShape,
  internalTokenVerifierConfigShape,
} from '@cadenway/nest-common';
import type {
  BaseConfig,
  Ed25519PrivateJwk,
  InternalTokenVerifierConfig,
} from '@cadenway/nest-common';
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
 *   Document, Search and Notification issuer keys separately through their public JWK variables.
 *   The explicit issuer map takes precedence.
 * - `SEARCH_PROJECTION_CURSOR_SECRET`: optional 32-byte base64url key shared by Task replicas
 *   to authenticate Search export cursors.
 * - `TASK_MEMBERSHIP_AUTHORITY_MODE`: `required` by default, requiring the Organization origin and
 *   Task signing key. The `limited` mode permits running an isolated Task service with neither
 *   setting. Operations that require current membership proofs remain unavailable in that case.
 * - `ORGANIZATION_SERVICE_URL` and `TASK_SERVICE_INTERNAL_TOKEN_PRIVATE_JWK`: paired configuration
 *   for current membership checks against Organization.
 *
 * - `TRASH_WRITES_ENABLED` (`TrashConfig`): whether the writes that put something in the trash or
 *   make a tombstone are served ("Supprimer la tâche", `DELETE` of a list and of a space, "Vider la
 *   corbeille"); `false` by default.
 *
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is read by `telemetry.ts`, before the application exists.
 */
export type AppConfig = BaseConfig &
  DatabaseConfig &
  MessagingConfig &
  InternalTokenVerifierConfig &
  TrashConfig & {
    readonly SEARCH_PROJECTION_CURSOR_SECRET?: string;
    readonly TASK_MEMBERSHIP_AUTHORITY_MODE: 'required' | 'limited';
    readonly ORGANIZATION_SERVICE_URL?: string;
    readonly TASK_SERVICE_INTERNAL_TOKEN_PRIVATE_JWK?: Ed25519PrivateJwk;
  };

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

/** Parses an optional hosted key list with the kit's public issuer rules. */
function optionalIssuerConfig(
  issuer: 'document-service' | 'search-service' | 'notification-service',
) {
  return z
    .string()
    .trim()
    .optional()
    .transform((input, context): InternalTokenVerifierConfig['INTERNAL_TOKEN_TRUSTED_ISSUERS'] => {
      if (input === undefined || input === '' || input === 'null') return {};
      try {
        const keys: unknown = JSON.parse(`[${input}]`);
        const parsed = internalTokenVerifierConfigShape.INTERNAL_TOKEN_TRUSTED_ISSUERS.safeParse(
          JSON.stringify({ [issuer]: keys }),
        );
        if (parsed.success) return parsed.data;
      } catch {
        // Report the variable without its contents.
      }
      context.addIssue({
        code: 'custom',
        message: 'Expected comma-separated public Ed25519 JWKs.',
      });
      return z.NEVER;
    });
}

const searchProjectionCursorSecret = z
  .string()
  .optional()
  .transform((input, context): string | undefined => {
    if (input === undefined || input === '') return undefined;
    if (input.length === 43 && Buffer.from(input, 'base64url').toString('base64url') === input) {
      return input;
    }
    context.addIssue({ code: 'custom', message: 'Expected 32 bytes in canonical base64url.' });
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
    DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: optionalIssuerConfig('document-service'),
    SEARCH_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: optionalIssuerConfig('search-service'),
    NOTIFICATION_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: optionalIssuerConfig('notification-service'),
    SEARCH_PROJECTION_CURSOR_SECRET: searchProjectionCursorSecret,
    TASK_MEMBERSHIP_AUTHORITY_MODE: z.enum(['required', 'limited']).default('required'),
    ORGANIZATION_SERVICE_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .trim()
        .max(512)
        .refine((value) => {
          const url = URL.parse(value);
          return url?.origin === value && (url.protocol === 'http:' || url.protocol === 'https:');
        }, 'Expected an HTTP or HTTPS origin.')
        .optional(),
    ),
    TASK_SERVICE_INTERNAL_TOKEN_PRIVATE_JWK: z.preprocess(
      (value) => (value === '' ? undefined : value),
      internalTokenSignerConfigShape.INTERNAL_TOKEN_PRIVATE_JWK.optional(),
    ),
    TRASH_WRITES_ENABLED: z.stringbool().default(false),
  })
  .superRefine((config, context) => {
    const { ORGANIZATION_SERVICE_URL: origin, TASK_SERVICE_INTERNAL_TOKEN_PRIVATE_JWK: key } =
      config;
    if (
      config.TASK_MEMBERSHIP_AUTHORITY_MODE === 'limited' &&
      origin === undefined &&
      key === undefined
    ) {
      return;
    }
    if (origin === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['ORGANIZATION_SERVICE_URL'],
        message: 'Configure the Organization origin for current membership checks.',
      });
    }
    if (key === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['TASK_SERVICE_INTERNAL_TOKEN_PRIVATE_JWK'],
        message: 'Configure the Task signing key for current membership checks.',
      });
    }
  })
  .transform(
    ({
      DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS,
      SEARCH_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS,
      NOTIFICATION_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS,
      ...config
    }): AppConfig => ({
      ...config,
      INTERNAL_TOKEN_TRUSTED_ISSUERS: {
        ...DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS,
        ...SEARCH_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS,
        ...NOTIFICATION_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS,
        ...config.INTERNAL_TOKEN_TRUSTED_ISSUERS,
      },
    }),
  );

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
