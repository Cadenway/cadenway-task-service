import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { ConfigError, loadConfig } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { appConfigSchema, migrationConfigSchema } from './app-config.js';
import { processRoleSchema, runtimeConfigSchema } from './runtime-config.js';

describe('appConfigSchema', () => {
  const trustedIssuers: string =
    '{"api-gateway":[{"kty":"OKP","crv":"Ed25519","x":"MVZQc5h6AXxnMpaBTaYw5kI-yWWawl6zp8Srhuf5NK0","kid":"local-placeholder"}]}';
  const complete: Readonly<Record<string, string>> = {
    PORT: '3013',
    DATABASE_URL: 'postgres://task_app:task_app@localhost:5432/task',
    NATS_URL: 'nats://localhost:4222',
    NATS_USER: 'task',
    NATS_PASSWORD: 'task',
    INTERNAL_TOKEN_AUDIENCE: 'task-service',
    INTERNAL_TOKEN_TRUSTED_ISSUERS: trustedIssuers,
  };

  it('reads the variables of the service with the defaults of the kit', () => {
    expect(loadConfig(appConfigSchema, complete)).toEqual({
      NODE_ENV: 'production',
      PORT: 3013,
      LOG_LEVEL: 'info',
      LOG_PRETTY: false,
      DATABASE_URL: 'postgres://task_app:task_app@localhost:5432/task',
      NATS_URL: 'nats://localhost:4222',
      NATS_USER: 'task',
      NATS_PASSWORD: 'task',
      TASK_SERVICE_OUTBOX_MODE: 'legacy',
      INTERNAL_TOKEN_AUDIENCE: 'task-service',
      INTERNAL_TOKEN_TRUSTED_ISSUERS: {
        'api-gateway': [
          {
            kty: 'OKP',
            crv: 'Ed25519',
            x: 'MVZQc5h6AXxnMpaBTaYw5kI-yWWawl6zp8Srhuf5NK0',
            kid: 'local-placeholder',
          },
        ],
      },
    });
  });

  it('accepts the committed .env.example as it is', () => {
    const example: NodeJS.Dict<string> = parseEnv(
      readFileSync(new URL('../../.env.example', import.meta.url), 'utf8'),
    );

    expect(() => loadConfig(appConfigSchema, example)).not.toThrow();
    expect(() => loadConfig(migrationConfigSchema, example)).not.toThrow();
  });

  it('accepts only a known deployment mode for the outbox', () => {
    expect(
      loadConfig(appConfigSchema, { ...complete, TASK_SERVICE_OUTBOX_MODE: 'dedicated' }),
    ).toHaveProperty('TASK_SERVICE_OUTBOX_MODE', 'dedicated');
    expect(() =>
      loadConfig(appConfigSchema, { ...complete, TASK_SERVICE_OUTBOX_MODE: 'relays' }),
    ).toThrow(/TASK_SERVICE_OUTBOX_MODE/u);
  });

  it('refuses to start without the database, the broker, the audience or the trusted issuers', () => {
    expect(() => loadConfig(appConfigSchema, { PORT: '3013' })).toThrow(ConfigError);
    try {
      loadConfig(appConfigSchema, { PORT: '3013' });
    } catch (error) {
      const issues: readonly string[] = (error as ConfigError).issues;
      expect(issues.map((issue) => issue.split(':')[0])).toEqual(
        expect.arrayContaining([
          'DATABASE_URL',
          'NATS_URL',
          'INTERNAL_TOKEN_AUDIENCE',
          'INTERNAL_TOKEN_TRUSTED_ISSUERS',
        ]),
      );
    }
  });

  it('refuses a database URL that is not PostgreSQL, without printing it', () => {
    const secret: string = 'mysql://task_app:s3cret@localhost/task';

    expect(() => loadConfig(appConfigSchema, { ...complete, DATABASE_URL: secret })).toThrow(
      /DATABASE_URL/u,
    );
    expect(() => loadConfig(appConfigSchema, { ...complete, DATABASE_URL: secret })).not.toThrow(
      /s3cret/u,
    );
  });

  it('refuses a broker URL that is not NATS, without printing it', () => {
    const secret: string = 'http://task:s3cret@localhost:4222';

    expect(() => loadConfig(appConfigSchema, { ...complete, NATS_URL: secret })).toThrow(
      /NATS_URL/u,
    );
    expect(() => loadConfig(appConfigSchema, { ...complete, NATS_URL: secret })).not.toThrow(
      /s3cret/u,
    );
  });

  it('refuses a private key listed as a verification key', () => {
    const withPrivateKey: string = trustedIssuers.replace('"kid"', `"d":"${'A'.repeat(43)}","kid"`);

    expect(() =>
      loadConfig(appConfigSchema, { ...complete, INTERNAL_TOKEN_TRUSTED_ISSUERS: withPrivateKey }),
    ).toThrow(/INTERNAL_TOKEN_TRUSTED_ISSUERS/u);
  });

  it('does not read the migrator URL: the running service never needs it', () => {
    expect(loadConfig(appConfigSchema, complete)).not.toHaveProperty('MIGRATION_DATABASE_URL');
  });
});

describe('relay process', () => {
  it('defaults to the API and accepts the standalone relay role', () => {
    expect(loadConfig(processRoleSchema, {})).toEqual({ TASK_SERVICE_ROLE: 'api' });
    expect(loadConfig(processRoleSchema, { TASK_SERVICE_ROLE: 'outbox-relay' })).toEqual({
      TASK_SERVICE_ROLE: 'outbox-relay',
    });
    expect(() => loadConfig(processRoleSchema, { TASK_SERVICE_ROLE: 'worker' })).toThrow(
      /TASK_SERVICE_ROLE/u,
    );
  });

  it('reads only the service database and messaging credentials for readiness', () => {
    expect(
      loadConfig(runtimeConfigSchema, {
        PORT: '3013',
        DATABASE_URL: 'postgres://task_app@localhost/task',
        NATS_URL: 'nats://localhost:4222',
      }),
    ).not.toHaveProperty('INTERNAL_TOKEN_TRUSTED_ISSUERS');
  });
});

describe('migrationConfigSchema', () => {
  it('reads the URL of the migrator role', () => {
    expect(
      loadConfig(migrationConfigSchema, {
        MIGRATION_DATABASE_URL: 'postgres://task_migrator:task_migrator@localhost:5432/task',
      }),
    ).toEqual({
      MIGRATION_DATABASE_URL: 'postgres://task_migrator:task_migrator@localhost:5432/task',
    });
  });

  it('names MIGRATION_DATABASE_URL when it is missing', () => {
    expect(() =>
      loadConfig(migrationConfigSchema, {
        DATABASE_URL: 'postgres://task_app:task_app@localhost:5432/task',
      }),
    ).toThrow(/MIGRATION_DATABASE_URL: required, not set/u);
  });

  it('names MIGRATION_DATABASE_URL when it is not a PostgreSQL URL, without printing it', () => {
    const secret: string = 'mysql://task_migrator:s3cret@localhost/task';

    expect(() => loadConfig(migrationConfigSchema, { MIGRATION_DATABASE_URL: secret })).toThrow(
      /MIGRATION_DATABASE_URL: Expected the postgres:\/\/ URL of the migrator role/u,
    );
    expect(() => loadConfig(migrationConfigSchema, { MIGRATION_DATABASE_URL: secret })).not.toThrow(
      /s3cret/u,
    );
  });
});
