import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { ConfigError, loadConfig } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { appConfigSchema, migrationConfigSchema } from './app-config.js';

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
      DATABASE_TRANSACTION_MAX_ATTEMPTS: 3,
      NATS_URL: 'nats://localhost:4222',
      NATS_USER: 'task',
      NATS_PASSWORD: 'task',
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
      TRASH_WRITES_ENABLED: false,
    });
  });

  it('accepts a single transaction attempt and rejects a limit below one', () => {
    expect(
      loadConfig(appConfigSchema, { ...complete, DATABASE_TRANSACTION_MAX_ATTEMPTS: '1' }),
    ).toMatchObject({ DATABASE_TRANSACTION_MAX_ATTEMPTS: 1 });
    expect(() =>
      loadConfig(appConfigSchema, { ...complete, DATABASE_TRANSACTION_MAX_ATTEMPTS: '0' }),
    ).toThrow(/DATABASE_TRANSACTION_MAX_ATTEMPTS/u);
  });

  it('adds optional hosted Document trust without replacing explicit issuers', () => {
    const key = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'MVZQc5h6AXxnMpaBTaYw5kI-yWWawl6zp8Srhuf5NK0',
      kid: 'fixture-document',
    };
    const input = { ...complete, DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: JSON.stringify(key) };
    expect(loadConfig(appConfigSchema, input).INTERNAL_TOKEN_TRUSTED_ISSUERS).toMatchObject({
      'api-gateway': [{ kid: 'local-placeholder' }],
      'document-service': [key],
    });
    const explicit = { ...key, kid: 'explicit-document' };
    expect(
      loadConfig(appConfigSchema, {
        ...input,
        INTERNAL_TOKEN_TRUSTED_ISSUERS: JSON.stringify({ 'document-service': [explicit] }),
      }).INTERNAL_TOKEN_TRUSTED_ISSUERS,
    ).toEqual({ 'document-service': [explicit] });
    for (const disabled of ['', 'null']) {
      expect(
        loadConfig(appConfigSchema, {
          ...complete,
          DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: disabled,
        }).INTERNAL_TOKEN_TRUSTED_ISSUERS,
      ).not.toHaveProperty('document-service');
    }
    expect(() =>
      loadConfig(appConfigSchema, {
        ...complete,
        DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: 'invalid-fixture',
      }),
    ).toThrow(/DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS/u);
  });

  it('adds the hosted Search verification keys alongside Document and Gateway', () => {
    const first = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'MVZQc5h6AXxnMpaBTaYw5kI-yWWawl6zp8Srhuf5NK0',
      kid: 'fixture-search-current',
    };
    const second = { ...first, kid: 'fixture-search-next' };
    const document = { ...first, kid: 'fixture-document' };
    const options = {
      ...complete,
      DOCUMENT_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: JSON.stringify(document),
      SEARCH_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: [first, second]
        .map((key) => JSON.stringify(key))
        .join(','),
    };

    expect(loadConfig(appConfigSchema, options).INTERNAL_TOKEN_TRUSTED_ISSUERS).toMatchObject({
      'api-gateway': [{ kid: 'local-placeholder' }],
      'document-service': [document],
      'search-service': [first, second],
    });
    const explicit = { ...first, kid: 'fixture-search-explicit' };
    expect(
      loadConfig(appConfigSchema, {
        ...options,
        INTERNAL_TOKEN_TRUSTED_ISSUERS: JSON.stringify({ 'search-service': [explicit] }),
      }).INTERNAL_TOKEN_TRUSTED_ISSUERS,
    ).toEqual({ 'document-service': [document], 'search-service': [explicit] });
  });

  it('keeps hosted Search trust disabled when the list is unset and rejects private JWKs', () => {
    for (const disabled of ['', 'null']) {
      expect(
        loadConfig(appConfigSchema, {
          ...complete,
          SEARCH_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: disabled,
        }).INTERNAL_TOKEN_TRUSTED_ISSUERS,
      ).not.toHaveProperty('search-service');
    }
    const invalid = () =>
      loadConfig(appConfigSchema, {
        ...complete,
        SEARCH_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: 'invalid-search-fixture',
      });
    expect(invalid).toThrow(/SEARCH_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS/u);
    expect(invalid).not.toThrow(/invalid-search-fixture/u);
    const privateJwk = JSON.parse(
      trustedIssuers.replace('"kid"', `"d":"${'A'.repeat(43)}","kid"`),
    ) as {
      readonly 'api-gateway': readonly unknown[];
    };
    expect(() =>
      loadConfig(appConfigSchema, {
        ...complete,
        SEARCH_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS: JSON.stringify(privateJwk['api-gateway'][0]),
      }),
    ).toThrow(/SEARCH_SERVICE_INTERNAL_TOKEN_PUBLIC_JWKS/u);
  });

  it('accepts only canonical unpadded base64url for the optional Search cursor key', () => {
    const key = Buffer.alloc(32).toString('base64url');
    const config = (value: string) =>
      loadConfig(appConfigSchema, { ...complete, SEARCH_PROJECTION_CURSOR_SECRET: value });

    expect(config(key).SEARCH_PROJECTION_CURSOR_SECRET).toBe(key);
    expect(config('').SEARCH_PROJECTION_CURSOR_SECRET).toBeUndefined();
    expect(loadConfig(appConfigSchema, complete).SEARCH_PROJECTION_CURSOR_SECRET).toBeUndefined();
    for (const invalid of [`${key}=`, `${key.slice(0, -1)}B`, key.slice(1), `${key}\n`]) {
      expect(() => config(invalid)).toThrow(/SEARCH_PROJECTION_CURSOR_SECRET/u);
    }
    expect(() => config('invalid-cursor-fixture')).not.toThrow(/invalid-cursor-fixture/u);
  });

  it('serves the writes of the trash only when TRASH_WRITES_ENABLED says true', () => {
    expect(
      loadConfig(appConfigSchema, { ...complete, TRASH_WRITES_ENABLED: 'true' }),
    ).toMatchObject({
      TRASH_WRITES_ENABLED: true,
    });
    expect(
      loadConfig(appConfigSchema, { ...complete, TRASH_WRITES_ENABLED: 'false' }),
    ).toMatchObject({ TRASH_WRITES_ENABLED: false });
    expect(() =>
      loadConfig(appConfigSchema, { ...complete, TRASH_WRITES_ENABLED: 'peut-être' }),
    ).toThrow(/TRASH_WRITES_ENABLED/u);
  });

  it('accepts the committed .env.example as it is', () => {
    const example: NodeJS.Dict<string> = parseEnv(
      readFileSync(new URL('../../.env.example', import.meta.url), 'utf8'),
    );

    expect(() => loadConfig(appConfigSchema, example)).not.toThrow();
    expect(() => loadConfig(migrationConfigSchema, example)).not.toThrow();
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
