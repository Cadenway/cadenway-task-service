import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createApplication,
  InternalTokenSigner,
  loadConfig,
  runWithOrganizationContext,
} from '@cadenway/nest-common';
import type {
  Ed25519PrivateJwk,
  Ed25519PublicJwk,
  OrganizationContext,
} from '@cadenway/nest-common';
import { SystemTransactionRunner, TenantTransactionRunner } from '@cadenway/nest-common/database';
import { Controller, Get, Injectable, Module } from '@nestjs/common';
import type { BeforeApplicationShutdown } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { appConfigSchema } from '../src/config/app-config.js';

// The service as main.ts assembles it, on a disposable PostgreSQL and NATS. `@cadenway/nest-testing`
// does not export its container fixtures yet and a service never depends on `testcontainers` itself,
// so the dependencies are those of compose.dev.yaml, started as a throwaway Compose project on free
// ports: PostgreSQL with the two roles of cadenway-ops, NATS with its authorization (the `task` user,
// its subjects, the inbox prefix `_INBOX.task`) and its three streams.

/** Compose file of the development dependencies. */
const composeFile: string = fileURLToPath(new URL('../compose.dev.yaml', import.meta.url));

/** Throwaway project name: it never touches the data of the developer's own dev stack. */
const project = `cadenway-task-service-test-${String(process.pid)}`;

/**
 * Host port of NATS. Fixed for the run, unlike the ephemeral port of PostgreSQL: the service must
 * find NATS at the same address after the test restarts it, and Docker gives an ephemeral mapping a
 * new port at each start.
 */
let natsHostPort = '0';

/** Atelier Nord, the organization of the mockup. */
const atelierNordId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';

/** Another organization, which must never see a row of Atelier Nord. */
const otherOrganizationId = '01938f6e-0000-7000-8000-000000000002';

/** Camille Martin (CM), the member of Atelier Nord the mockup signs in as. */
const camilleMartinId = '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c24';

/** IDs for a task and its activity created before the collaboration migration. */
const legacySpaceId = '01938f6e-0000-7000-8000-000000000101';
const legacyListId = '01938f6e-0000-7000-8000-000000000102';
const legacyTaskId = '01938f6e-0000-7000-8000-000000000103';
const legacyActivityId = '01938f6e-0000-7000-8000-000000000104';

/** The tables of the platform module, as the kit names them. */
const platformTables = [
  'event_versions',
  'idempotency_keys',
  'outbox_events',
  'processed_events',
] as const;

/**
 * Every table the migrations create, by name: the kit tables, the memberships, the spaces and the
 * tasks with what hangs from them, the grants of the spaces and lists, the access requests and the
 * trash entries.
 */
const publicTables = [
  'access_request_attempts',
  'access_requests',
  'activity_entries',
  'checklist_items',
  'event_versions',
  'favorites',
  'idempotency_keys',
  'list_grants',
  'lists',
  'organization_members',
  'outbox_events',
  'processed_events',
  'saved_views',
  'space_grants',
  'space_prefixes',
  'spaces',
  'task_assignees',
  'task_comments',
  'task_dependencies',
  'task_labels',
  'task_templates',
  'task_watcher_overrides',
  'tasks',
  'trash_entries',
] as const;

/**
 * Migrations of the journal: the platform tables, the copy of the memberships, the spaces and their
 * lists, then the tasks, then the two indexes of the task queries, then the grants, the switch of
 * the lists and the access requests, then the archives of lists and tasks, then the trash and the
 * deletion of lists and spaces, then the trash root snapshot, collaboration, planning and the
 * task library.
 */
const appliedMigrations = 12;

/**
 * Runs `docker compose` on the throwaway project.
 *
 * @param args - Compose command and its arguments.
 * @returns The standard output.
 */
function compose(...args: readonly string[]): string {
  return execFileSync(
    'docker',
    ['compose', '--project-name', project, '--file', composeFile, ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, DEV_POSTGRES_PORT: '0', DEV_NATS_PORT: natsHostPort },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

/**
 * Runs the NATS command line of the `nats-streams` container against the broker of the project.
 *
 * @param env - Variables that replace the `admin` credentials of the container for this call.
 * @param args - Arguments of the `nats` command.
 * @returns Whether the broker accepted the command.
 */
function brokerAccepts(env: Readonly<Record<string, string>>, ...args: readonly string[]): boolean {
  const variables = Object.entries(env).flatMap(([name, value]) => ['--env', `${name}=${value}`]);
  try {
    compose('exec', '-T', ...variables, 'nats-streams', 'nats', '--timeout', '2s', ...args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds a port of the loopback interface that nothing listens on.
 *
 * @returns A free port, released before it is returned.
 */
async function freePort(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === 'string') {
          reject(new Error('The probe server has no TCP address.'));
        } else {
          resolve(String(address.port));
        }
      });
    });
  });
}

/**
 * Reads the published host port of a service of the project.
 *
 * @param service - Compose service.
 * @param port - Port inside the container.
 * @returns The host port.
 */
function hostPort(service: string, port: string): string {
  return compose('port', service, port).trim().split(':').at(-1) ?? '';
}

/**
 * Creates an Ed25519 key pair in the JWK forms the internal token uses.
 *
 * @returns The public key for the verifier and the private key for a signer.
 */
function keyPair(): {
  readonly publicJwk: Ed25519PublicJwk;
  readonly privateJwk: Ed25519PrivateJwk;
} {
  const { x, d } = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
  if (x === undefined || d === undefined) {
    throw new Error('Node returned an Ed25519 JWK without its key material.');
  }
  const publicJwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x, kid: 'test-api-gateway' };
  return { publicJwk, privateJwk: { ...publicJwk, d } };
}

/**
 * The organization context of a member of an organization, as the internal token gives it.
 *
 * @param organizationId - Organization of the context.
 * @returns The context the tenant runner reads.
 */
function memberOf(organizationId: string): OrganizationContext {
  return {
    organizationId,
    actor: { type: 'user', id: camilleMartinId },
    role: null,
    scopes: [],
  };
}

/**
 * Applies the migrations with `src/migrate.ts`, the entry point of the migration container, as
 * the migrator role. Each call imports the module afresh, as each container start runs it once.
 */
async function runMigrator(): Promise<void> {
  vi.resetModules();
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    await import('../src/migrate.js');
  } finally {
    log.mockRestore();
  }
}

/** Applies the actual journal through 0007 before seeding pre-existing data. */
async function migrateThroughTrash(pool: pg.Pool): Promise<void> {
  const source = fileURLToPath(new URL('../migrations/', import.meta.url));
  const temporary = await mkdtemp(join(tmpdir(), 'cadenway-task-migrations-'));
  try {
    const journal = JSON.parse(await readFile(join(source, 'meta', '_journal.json'), 'utf8')) as {
      readonly version: string;
      readonly dialect: string;
      readonly entries: readonly { readonly tag: string }[];
    };
    const trash = journal.entries.findIndex((entry) => entry.tag === '0007_trash');
    if (trash < 0) throw new Error('The migration journal does not contain 0007_trash.');
    const entries = journal.entries.slice(0, trash + 1);
    await mkdir(join(temporary, 'meta'));
    await writeFile(
      join(temporary, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries }),
    );
    for (const entry of entries) {
      await copyFile(join(source, `${entry.tag}.sql`), join(temporary, `${entry.tag}.sql`));
    }
    await migrate(drizzle({ client: pool }), { migrationsFolder: temporary });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** Creates the existing task and activity using the schema ending at 0007. */
async function seedLegacyTask(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('app.organization_id', $1, true)`, [atelierNordId]);
    await client.query(
      `insert into spaces (organization_id, id, name, prefix, color, visibility, owner_user_id, statuses)
       values ($1, $2, 'Produit', 'CAD', 'violet', 'organization', $3, '[]'::jsonb)`,
      [atelierNordId, legacySpaceId, camilleMartinId],
    );
    await client.query(
      `insert into lists (organization_id, id, space_id, name, color)
       values ($1, $2, $3, 'Sprint 14', 'violet')`,
      [atelierNordId, legacyListId, legacySpaceId],
    );
    await client.query(
      `insert into tasks
         (organization_id, id, key_prefix, key_number, space_id, list_id, name, description,
          status, priority, created_by_type, created_by_id)
       values ($1, $2, 'CAD', 482, $3, $4, 'Préparer la démo', 'Description existante',
               'progress', 'moyenne', 'user', $5)`,
      [atelierNordId, legacyTaskId, legacySpaceId, legacyListId, camilleMartinId],
    );
    await client.query(
      `insert into activity_entries
         (organization_id, id, task_id, list_id, kind, actor_type, actor_id, occurred_at,
          status_from, status_to)
       values ($1, $2, $3, $4, 'status', 'user', $5, '2026-11-01T10:00:00Z', 'todo', 'progress')`,
      [atelierNordId, legacyActivityId, legacyTaskId, legacyListId, camilleMartinId],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Releases the shutdown held by `ShutdownGate`. */
let releaseShutdown: () => void = () => undefined;

/** Settles once `releaseShutdown` is called. */
const shutdownReleased = new Promise<void>((resolve) => {
  releaseShutdown = resolve;
});

/**
 * Holds the shutdown after readiness turned down and before the listener closes, the way a slow
 * handler or relay pass would, so the probes can be read during the stop.
 */
@Injectable()
class ShutdownGate implements BeforeApplicationShutdown {
  public async beforeApplicationShutdown(): Promise<void> {
    await shutdownReleased;
  }
}

/** A route of the application that declares no exemption, like every business route will. */
@Controller('internal/v1/wiring-probe')
class WiringProbeController {
  @Get()
  public probe(): { readonly reached: true } {
    return { reached: true };
  }
}

describe('task-service wiring', () => {
  const gateway = keyPair();
  let app: NestExpressApplication | undefined;
  let signer: InternalTokenSigner;
  let migrator: pg.Pool;
  let postgresPort = '';

  /**
   * The running application.
   *
   * @returns The application created in `beforeAll`.
   */
  function service(): NestExpressApplication {
    if (app === undefined) {
      throw new Error('The application did not start.');
    }
    return app;
  }

  beforeAll(async () => {
    natsHostPort = await freePort();
    compose(
      'up',
      '--detach',
      '--wait',
      '--wait-timeout',
      '120',
      'postgres',
      'nats',
      'nats-streams',
    );
    postgresPort = hostPort('postgres', '5432');

    vi.stubEnv(
      'MIGRATION_DATABASE_URL',
      `postgres://task_migrator:task_migrator@127.0.0.1:${postgresPort}/task`,
    );
    migrator = new pg.Pool({
      connectionString: `postgres://task_migrator:task_migrator@127.0.0.1:${postgresPort}/task`,
      max: 1,
      // Kept open for the whole run, so the stop of PostgreSQL below always reaches it.
      idleTimeoutMillis: 0,
    });
    // The client is terminated (57P01) when a test stops PostgreSQL; the pool reports it as an
    // `error` event, which would otherwise be an uncaught exception.
    migrator.on('error', () => undefined);
    await migrateThroughTrash(migrator);
    await seedLegacyTask(migrator);
    await runMigrator();

    vi.stubEnv('PORT', '3013');
    vi.stubEnv('LOG_PRETTY', 'false');
    vi.stubEnv('DATABASE_URL', `postgres://task_app:task_app@127.0.0.1:${postgresPort}/task`);
    vi.stubEnv('NATS_URL', `nats://127.0.0.1:${natsHostPort}`);
    vi.stubEnv('NATS_USER', 'task');
    vi.stubEnv('NATS_PASSWORD', 'task');
    vi.stubEnv('INTERNAL_TOKEN_AUDIENCE', 'task-service');
    vi.stubEnv(
      'INTERNAL_TOKEN_TRUSTED_ISSUERS',
      JSON.stringify({ 'api-gateway': [gateway.publicJwk] }),
    );
    @Module({
      imports: [AppModule],
      controllers: [WiringProbeController],
      providers: [ShutdownGate],
    })
    class ProbedApplicationModule {}

    // As main.ts: the configuration is read inside the start-up, never when a module is imported.
    const config = loadConfig(appConfigSchema);
    app = await createApplication(ProbedApplicationModule, {
      service: 'task-service',
      config,
      internalToken: {
        verifier: {
          audience: config.INTERNAL_TOKEN_AUDIENCE,
          trustedIssuers: config.INTERNAL_TOKEN_TRUSTED_ISSUERS,
        },
      },
      logDestination: { write: (): void => undefined },
    });
    await app.init();
    signer = await InternalTokenSigner.create({
      issuer: 'api-gateway',
      privateJwk: gateway.privateJwk,
    });
  });

  afterAll(async () => {
    try {
      releaseShutdown();
      await app?.close();
      await migrator.end();
    } finally {
      vi.unstubAllEnvs();
      compose('down', '--volumes', '--remove-orphans');
    }
  });

  it('applies its migrations as the migrator role, which owns the tables', async () => {
    const tables = await migrator.query<{ tablename: string; tableowner: string }>(
      `select tablename, tableowner from pg_tables where schemaname = 'public' order by tablename`,
    );
    const journal = await migrator.query<{ applied: number }>(
      'select count(*)::int as applied from drizzle.__drizzle_migrations',
    );

    expect(tables.rows).toEqual(
      publicTables.map((tablename) => ({ tablename, tableowner: 'task_migrator' })),
    );
    expect(journal.rows).toEqual([{ applied: appliedMigrations }]);
  });

  it('applies the complete journal to a fresh database with forced isolation', async () => {
    compose(
      'exec',
      '-T',
      'postgres',
      'createdb',
      '-U',
      'postgres',
      '-O',
      'task_migrator',
      'task_fresh',
    );
    const fresh = new pg.Pool({
      connectionString: `postgres://task_migrator:task_migrator@127.0.0.1:${postgresPort}/task_fresh`,
    });
    try {
      await migrate(drizzle({ client: fresh }), {
        migrationsFolder: fileURLToPath(new URL('../migrations/', import.meta.url)),
      });
      const journal = await fresh.query<{ readonly applied: number }>(
        'select count(*)::int as applied from drizzle.__drizzle_migrations',
      );
      const security = await fresh.query<{
        readonly relname: string;
        readonly relrowsecurity: boolean;
        readonly relforcerowsecurity: boolean;
      }>(
        `select relname, relrowsecurity, relforcerowsecurity from pg_class
          where relnamespace = 'public'::regnamespace
            and relname in ('favorites', 'saved_views', 'task_comments', 'task_dependencies',
                            'task_templates', 'task_watcher_overrides')
          order by relname`,
      );
      expect(journal.rows).toEqual([{ applied: appliedMigrations }]);
      expect(security.rows).toEqual([
        { relname: 'favorites', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'saved_views', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'task_comments', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'task_dependencies', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'task_templates', relrowsecurity: true, relforcerowsecurity: true },
        { relname: 'task_watcher_overrides', relrowsecurity: true, relforcerowsecurity: true },
      ]);
    } finally {
      await fresh.end();
      compose('exec', '-T', 'postgres', 'dropdb', '-U', 'postgres', 'task_fresh');
    }
  });

  it('upgrades the task and activity created before collaboration without losing their values', async () => {
    const tenant = service().get(TenantTransactionRunner);
    const rows = await runWithOrganizationContext(memberOf(atelierNordId), () =>
      tenant.run((tx) =>
        tx.client.query(
          `select task.description, task.description_mentions, activity.kind,
                  activity.status_from, activity.status_to, activity.comment_id, activity.comment_excerpt
             from tasks as task
             join activity_entries as activity on activity.organization_id = task.organization_id
                  and activity.task_id = task.id
            where task.id = $1 and activity.id = $2`,
          [legacyTaskId, legacyActivityId],
        ),
      ),
    );

    expect(rows.rows).toEqual([
      {
        description: 'Description existante',
        description_mentions: null,
        kind: 'status',
        status_from: 'todo',
        status_to: 'progress',
        comment_id: null,
        comment_excerpt: null,
      },
    ]);
  });

  it('isolates the new comment and watcher rows by organization for the application role', async () => {
    const tenant = service().get(TenantTransactionRunner);
    await runWithOrganizationContext(memberOf(atelierNordId), () =>
      tenant.run(async (tx) => {
        await tx.client.query(
          `insert into task_comments (organization_id, task_id, actor_type, actor_id, body)
           values ($1, $2, 'user', $3, 'Prêt pour la démo')`,
          [atelierNordId, legacyTaskId, camilleMartinId],
        );
        await tx.client.query(
          `insert into task_watcher_overrides (organization_id, task_id, user_id, following)
           values ($1, $2, $3, true)`,
          [atelierNordId, legacyTaskId, camilleMartinId],
        );
      }),
    );

    const counts = async (organizationId: string): Promise<readonly unknown[]> =>
      runWithOrganizationContext(memberOf(organizationId), () =>
        tenant.run(async (tx) => {
          const result = await tx.client.query(
            `select (select count(*)::int from task_comments) as comments,
                    (select count(*)::int from task_watcher_overrides) as watchers`,
          );
          return result.rows;
        }),
      );

    expect(await counts(atelierNordId)).toEqual([{ comments: 1, watchers: 1 }]);
    expect(await counts(otherOrganizationId)).toEqual([{ comments: 0, watchers: 0 }]);
    for (const statement of [
      `insert into task_comments (organization_id, task_id, actor_type, actor_id, body)
       values ($1, $2, 'user', $3, 'Cross-organization comment')`,
      `insert into task_watcher_overrides (organization_id, task_id, user_id, following)
       values ($1, $2, $3, false)`,
    ]) {
      await expect(
        runWithOrganizationContext(memberOf(otherOrganizationId), () =>
          tenant.run((tx) =>
            tx.client.query(statement, [atelierNordId, legacyTaskId, camilleMartinId]),
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('applies nothing when the migrator runs again', async () => {
    await runMigrator();

    const journal = await migrator.query<{ applied: number }>(
      'select count(*)::int as applied from drizzle.__drizzle_migrations',
    );
    expect(journal.rows).toEqual([{ applied: appliedMigrations }]);
  });

  it('provisions the pg-boss schema as the migrator role, with the queues of the service and their dead-letter queues', async () => {
    const schema = await migrator.query<{ owner: string }>(
      `select pg_get_userbyid(nspowner) as owner from pg_namespace where nspname = 'pgboss'`,
    );
    // The queues of the service; pg-boss keeps internal ones whose names start with `__pgboss__`.
    const queues = await migrator.query<{ name: string; dead_letter: string | null }>(
      `select name, dead_letter from pgboss.queue where left(name, 10) <> '__pgboss__' order by name`,
    );

    expect(schema.rows).toEqual([{ owner: 'task_migrator' }]);
    // The clean-up of a removed member and the four queues of the trash and the deletions.
    const names = [
      'task.clean-up-removed-member',
      'task.drop-trashed-task-requests',
      'task.purge-trash',
      'task.schedule-trash-purge',
      'task.trash-deleted-tasks',
    ];
    expect(queues.rows).toEqual(
      names
        .flatMap((name) => [
          { name, dead_letter: `${name}.dead-letter` },
          { name: `${name}.dead-letter`, dead_letter: null },
        ])
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)),
    );
  });

  it('lets the application role use the jobs but change no structure of the pg-boss schema', async () => {
    const system = service().get(SystemTransactionRunner);

    await expect(
      system.run((tx) => tx.client.query('select count(*) from pgboss.job')),
    ).resolves.toBeDefined();
    for (const statement of [
      'create table pgboss.wiring_probe (id integer)',
      'alter table pgboss.job add column wiring_probe integer',
      'truncate pgboss.job',
    ]) {
      await expect(system.run((tx) => tx.client.query(statement))).rejects.toMatchObject({
        code: '42501',
      });
    }
  });

  // The narrowings of `grantRuntimeAccess` (`@cadenway/nest-jobs/provisioning`): the migrator role
  // acts on what `bam` and `version` hold, so the application role must not write them.
  it('gives the application role no right on pgboss.bam, and on pgboss.version only the update of the claim columns', async () => {
    const privileges = await migrator.query<{
      readonly bam: readonly boolean[];
      readonly version: readonly boolean[];
      readonly version_column: boolean;
      readonly index_claim: boolean;
      readonly cron_claim: boolean;
    }>(
      `select
         array[has_table_privilege('task_app', 'pgboss.bam', 'select'),
               has_table_privilege('task_app', 'pgboss.bam', 'insert'),
               has_table_privilege('task_app', 'pgboss.bam', 'update'),
               has_table_privilege('task_app', 'pgboss.bam', 'delete')] as bam,
         array[has_table_privilege('task_app', 'pgboss.version', 'select'),
               has_table_privilege('task_app', 'pgboss.version', 'insert'),
               has_table_privilege('task_app', 'pgboss.version', 'delete')] as version,
         has_column_privilege('task_app', 'pgboss.version', 'version', 'update') as version_column,
         has_column_privilege('task_app', 'pgboss.version', 'bam_on', 'update') as index_claim,
         has_column_privilege('task_app', 'pgboss.version', 'cron_on', 'update') as cron_claim`,
    );
    const system = service().get(SystemTransactionRunner);

    expect(privileges.rows).toEqual([
      {
        bam: [false, false, false, false],
        version: [true, false, false],
        version_column: false,
        index_claim: false,
        cron_claim: true,
      },
    ]);
    for (const statement of [
      'select count(*) from pgboss.bam',
      'update pgboss.version set version = version',
      'update pgboss.version set bam_on = bam_on',
      'delete from pgboss.version',
    ]) {
      await expect(system.run((tx) => tx.client.query(statement))).rejects.toMatchObject({
        code: '42501',
      });
    }
    await expect(
      system.run((tx) => tx.client.query('update pgboss.version set cron_on = cron_on')),
    ).resolves.toBeDefined();
  });

  it('lets the application role own no object of the pg-boss schema', async () => {
    const owned = await migrator.query<{ readonly kind: string; readonly name: string }>(
      `select 'relation' as kind, c.relname::text as name from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'pgboss' and pg_get_userbyid(c.relowner) = 'task_app'
       union all
       select 'function', p.proname::text from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'pgboss' and pg_get_userbyid(p.proowner) = 'task_app'
       union all
       select 'type', t.typname::text from pg_type t
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'pgboss' and pg_get_userbyid(t.typowner) = 'task_app'`,
    );

    expect(owned.rows).toEqual([]);
  });

  it('forces row-level security on the tables that carry an organization', async () => {
    const tables = await migrator.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity
         from pg_class
        where relnamespace = 'public'::regnamespace and relkind = 'r'
        order by relname`,
    );
    const policies = await migrator.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies where schemaname = 'public' order by tablename`,
    );

    expect(tables.rows).toEqual([
      { relname: 'access_request_attempts', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'access_requests', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'activity_entries', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'checklist_items', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'event_versions', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'favorites', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'idempotency_keys', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'list_grants', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'lists', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'organization_members', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'outbox_events', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'processed_events', relrowsecurity: false, relforcerowsecurity: false },
      { relname: 'saved_views', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'space_grants', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'space_prefixes', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'spaces', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'task_assignees', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'task_comments', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'task_dependencies', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'task_labels', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'task_templates', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'task_watcher_overrides', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'tasks', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'trash_entries', relrowsecurity: true, relforcerowsecurity: true },
    ]);
    expect(policies.rows).toEqual([
      {
        tablename: 'access_request_attempts',
        policyname: 'access_request_attempts_organization_isolation',
      },
      { tablename: 'access_requests', policyname: 'access_requests_organization_isolation' },
      { tablename: 'activity_entries', policyname: 'activity_entries_organization_isolation' },
      { tablename: 'checklist_items', policyname: 'checklist_items_organization_isolation' },
      { tablename: 'event_versions', policyname: 'event_versions_organization_isolation' },
      { tablename: 'favorites', policyname: 'favorites_organization_isolation' },
      { tablename: 'idempotency_keys', policyname: 'idempotency_keys_organization_isolation' },
      { tablename: 'list_grants', policyname: 'list_grants_organization_isolation' },
      { tablename: 'lists', policyname: 'lists_organization_isolation' },
      {
        tablename: 'organization_members',
        policyname: 'organization_members_organization_isolation',
      },
      { tablename: 'outbox_events', policyname: 'outbox_events_organization_isolation' },
      { tablename: 'saved_views', policyname: 'saved_views_organization_isolation' },
      { tablename: 'space_grants', policyname: 'space_grants_organization_isolation' },
      { tablename: 'space_prefixes', policyname: 'space_prefixes_organization_isolation' },
      { tablename: 'spaces', policyname: 'spaces_organization_isolation' },
      { tablename: 'task_assignees', policyname: 'task_assignees_organization_isolation' },
      { tablename: 'task_comments', policyname: 'task_comments_organization_isolation' },
      { tablename: 'task_dependencies', policyname: 'task_dependencies_organization_isolation' },
      { tablename: 'task_labels', policyname: 'task_labels_organization_isolation' },
      { tablename: 'task_templates', policyname: 'task_templates_organization_isolation' },
      {
        tablename: 'task_watcher_overrides',
        policyname: 'task_watcher_overrides_organization_isolation',
      },
      { tablename: 'tasks', policyname: 'tasks_organization_isolation' },
      { tablename: 'trash_entries', policyname: 'trash_entries_organization_isolation' },
    ]);
  });

  it('answers the liveness probe without a token', async () => {
    const response = await request(service().getHttpServer()).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('is ready once PostgreSQL answers the application role and NATS the task user', async () => {
    const response = await request(service().getHttpServer()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      details: { postgres: { status: 'up' }, nats: { status: 'up' } },
    });
  });

  it('refuses a route of the application without an internal token', async () => {
    const response = await request(service().getHttpServer()).get('/internal/v1/wiring-probe');

    expect(response.status).toBe(401);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/u);
    expect(response.body).toMatchObject({ status: 401, code: 'auth.token-missing' });
  });

  it('serves a route to a trusted issuer acting for a member of the organization', async () => {
    const token = await signer.sign('task-service', {
      actor: { type: 'user', id: camilleMartinId },
      organizationId: atelierNordId,
    });

    const response = await request(service().getHttpServer())
      .get('/internal/v1/wiring-probe')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reached: true });
  });

  it('refuses a token signed for another service', async () => {
    const token = await signer.sign('document-service', {
      actor: { type: 'user', id: camilleMartinId },
      organizationId: atelierNordId,
    });

    const response = await request(service().getHttpServer())
      .get('/internal/v1/wiring-probe')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'auth.token-invalid',
      details: { reason: 'audience' },
    });
  });

  it('lets the application role read and write the platform tables of its organization only', async () => {
    const tenant = service().get(TenantTransactionRunner);
    const countAll = async (organizationId: string): Promise<Record<string, number>> =>
      runWithOrganizationContext(memberOf(organizationId), () =>
        tenant.run(async (tx) => {
          const counts = await tx.client.query(
            `select 'outbox_events' as name, count(*)::int as rows from outbox_events
             union all select 'event_versions', count(*)::int from event_versions
             union all select 'idempotency_keys', count(*)::int from idempotency_keys`,
          );
          const rows = counts.rows as readonly { readonly name: string; readonly rows: number }[];
          return Object.fromEntries(rows.map(({ name, rows: count }) => [name, count]));
        }),
      );

    // Sent rather than pending: the relay must have nothing to publish.
    await runWithOrganizationContext(memberOf(atelierNordId), () =>
      tenant.run(async (tx) => {
        await tx.client.query(
          `insert into outbox_events
             (id, event_name, subject, stream, organization_id, payload, status, sent_at)
           values (uuidv7(), 'task.wiring-probe.v1', 'evt.task.wiring-probe.v1', 'EVENTS', $1,
                   '{}', 'sent', now())`,
          [atelierNordId],
        );
        await tx.client.query(
          `insert into event_versions (consumer, organization_id, aggregate_key, version)
           values ('task-service__wiring-probe', $1, 'task:CAD-482', 1)`,
          [atelierNordId],
        );
        await tx.client.query(
          `update event_versions set version = 2 where aggregate_key = 'task:CAD-482'`,
        );
        await tx.client.query(
          `insert into idempotency_keys
             (organization_id, key, request_fingerprint, response_status, response_headers,
              expires_at)
           values ($1, 'wiring-probe', 'fingerprint', 201, '{}', now() + interval '1 day')`,
          [atelierNordId],
        );
        await tx.client.query(
          `insert into processed_events (consumer, event_id)
           values ('task-service__wiring-probe', uuidv7())`,
        );
      }),
    );

    expect(await countAll(atelierNordId)).toEqual({
      outbox_events: 1,
      event_versions: 1,
      idempotency_keys: 1,
    });
    expect(await countAll(otherOrganizationId)).toEqual({
      outbox_events: 0,
      event_versions: 0,
      idempotency_keys: 0,
    });
    await expect(
      runWithOrganizationContext(memberOf(otherOrganizationId), () =>
        tenant.run((tx) =>
          tx.client.query(
            `insert into event_versions (consumer, organization_id, aggregate_key, version)
             values ('task-service__wiring-probe', $1, 'task:CAD-483', 1)`,
            [atelierNordId],
          ),
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const deleted = await runWithOrganizationContext(memberOf(atelierNordId), () =>
      tenant.run(async (tx) => {
        const counts: number[] = [];
        for (const table of platformTables) {
          counts.push((await tx.client.query(`delete from ${table} returning 1`)).rows.length);
        }
        return counts;
      }),
    );
    expect(deleted).toEqual([1, 1, 1, 1]);
  });

  it('refuses any change of structure to the application role', async () => {
    const system = service().get(SystemTransactionRunner);
    const statements = [
      'create table wiring_probe (id integer)',
      'alter table outbox_events add column wiring_probe integer',
      'alter table outbox_events no force row level security',
      'drop table processed_events',
      'truncate idempotency_keys',
      'create schema wiring_probe',
    ];

    for (const statement of statements) {
      await expect(system.run((tx) => tx.client.query(statement))).rejects.toMatchObject({
        code: '42501',
      });
    }
  });

  it('keeps the application role out of the journal of the migrations', async () => {
    const system = service().get(SystemTransactionRunner);

    // A rewritten journal would make the next migration run apply migrations again.
    await expect(
      system.run((tx) => tx.client.query('delete from drizzle.__drizzle_migrations')),
    ).rejects.toMatchObject({ code: '42501', message: 'permission denied for schema drizzle' });
    const journal = await migrator.query<{ applied: number }>(
      'select count(*)::int as applied from drizzle.__drizzle_migrations',
    );
    expect(journal.rows).toEqual([{ applied: appliedMigrations }]);
  });

  it('publishes pending outbox events automatically and stays healthy', async () => {
    const system = service().get(SystemTransactionRunner);
    const eventId = randomUUID();
    await system.run((tx) =>
      tx.client.query(
        `insert into outbox_events (id, event_name, subject, stream, organization_id, payload)
         values ($1::uuid, 'task.wiring-probe.v1', 'evt.task.wiring-probe.v1', 'EVENTS', $2::uuid,
                 jsonb_build_object('id', $1::uuid::text, 'organizationId', $2::uuid::text, 'occurredAt', now()))`,
        [eventId, atelierNordId],
      ),
    );

    await vi.waitFor(
      async () => {
        const result = await system.run((tx) =>
          tx.client.query('select status from outbox_events where id = $1', [eventId]),
        );
        expect(result.rows).toEqual([{ status: 'sent' }]);
      },
      { timeout: 10_000, interval: 100 },
    );

    const response = await request(service().getHttpServer()).get('/health/ready');
    expect(response.status).toBe(200);
  });

  it('runs against a broker that enforces the permissions of cadenway-ops', () => {
    const task = { NATS_USER: 'task', NATS_PASSWORD: 'task' };

    expect(brokerAccepts(task, '--inbox-prefix', '_INBOX.task', 'stream', 'info', 'EVENTS')).toBe(
      true,
    );
    expect(brokerAccepts(task, 'stream', 'info', 'EVENTS')).toBe(false);
    expect(brokerAccepts(task, 'pub', 'evt.doc.wiring-probe', 'refused')).toBe(false);
    expect(brokerAccepts({ NATS_USER: '', NATS_PASSWORD: '' }, 'pub', 'evt.task.x', 'x')).toBe(
      false,
    );
  });

  it('stops being ready while NATS is down, and is ready again once it is back', async () => {
    compose('stop', 'nats');

    await vi.waitFor(
      async () => {
        const response = await request(service().getHttpServer()).get('/health/ready');
        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({
          status: 'error',
          info: { postgres: { status: 'up' } },
          error: { nats: { status: 'down' } },
        });
      },
      { timeout: 10_000, interval: 250 },
    );

    compose('start', 'nats');

    await vi.waitFor(
      async () => {
        const response = await request(service().getHttpServer()).get('/health/ready');
        expect(response.status).toBe(200);
      },
      { timeout: 30_000, interval: 500 },
    );
  });

  it('stops being ready when its database is down', async () => {
    compose('stop', 'postgres');

    const response = await request(service().getHttpServer()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 'error',
      error: { postgres: { status: 'down' } },
    });
  });

  it('answers 503 on readiness and 200 on liveness as soon as it shuts down', async () => {
    const running = service();
    const closing = running.close();

    await vi.waitFor(
      async () => {
        const response = await request(running.getHttpServer()).get('/health/ready');
        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({
          error: { shutdown: { status: 'down', message: 'shutting down' } },
        });
      },
      { timeout: 5_000, interval: 50 },
    );
    const live = await request(running.getHttpServer()).get('/health/live');
    expect(live.status).toBe(200);

    releaseShutdown();
    await closing;
    app = undefined;
  });
});
