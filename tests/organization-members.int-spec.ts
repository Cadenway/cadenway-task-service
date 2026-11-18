import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import type {
  MemberJoinedV1,
  MemberRemovedV1,
  MemberRoleChangedV1,
} from '@cadenway/contracts/events/organization-service';
import { createApplication, loadConfig, runWithOrganizationContext } from '@cadenway/nest-common';
import type { Ed25519PublicJwk, OrganizationContext } from '@cadenway/nest-common';
import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { TransactionClient } from '@cadenway/nest-common/database';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { ApplyMembershipChange } from '../src/modules/organization-members/application/use-cases/commands/membership/apply-membership-change/apply-membership-change.use-case.js';
import { FindOrganizationMember } from '../src/modules/organization-members/application/use-cases/queries/membership/find-organization-member/find-organization-member.use-case.js';
import { FindOrganizationOwner } from '../src/modules/organization-members/application/use-cases/queries/membership/find-organization-owner/find-organization-owner.use-case.js';
import { appConfigSchema } from '../src/config/app-config.js';

// The copy of the memberships of organization-service, on a disposable PostgreSQL and NATS: the
// service as main.ts assembles it (the `task_app` role, the `task` NATS user), started from
// compose.dev.yaml as a throwaway Compose project on free ports, as service-wiring.int-spec.ts
// does. Member events are published to `EVENTS` with the `admin` user of the `nats-streams`
// container, as the outbox relay of organization-service would publish them, and the copy is read
// through the use cases another module would call, inside the tenant transaction of its context.
// The rows are read as the migrator role, which sets the system access of the policy, since row-level
// security is forced on its own table.

/** Compose file of the development dependencies. */
const composeFile: string = fileURLToPath(new URL('../compose.dev.yaml', import.meta.url));

/** Throwaway project name, distinct from the other specs and from any developer stack. */
const project = `cadenway-task-service-members-test-${String(process.pid)}`;

/** Role of a membership, as the contract names it. */
type MemberRole = MemberJoinedV1['role'];

/** How long the copy may take to follow a published event. */
const waitOptions = { timeout: 15_000, interval: 200 } as const;

/** Atelier Nord, the organization of the mockup. */
const atelierNordId = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';

/**
 * Another organization, which must never see a membership of Atelier Nord, nor be seen from it. Its
 * members reuse the account and the membership id of Camille Martin, which only the key
 * `(organization_id, id)` keeps apart.
 */
const otherOrganizationId = '01938f6e-0000-7000-8000-000000000002';

/**
 * Camille Martin (CM), owner of Atelier Nord, who joined before the service started. Her account
 * and her membership id.
 */
const camilleMartin = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c24',
  memberId: '01938f6e-9000-7000-8000-0000000000c1',
} as const;

/** Inès Robert (IR), who joins Atelier Nord after the start, is promoted, then removed. */
const inesRobert = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c25',
  memberId: '01938f6e-9000-7000-8000-0000000000c2',
} as const;

/** Hugo Dubois (HD), whose events arrive out of order. */
const hugoDubois = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c26',
  memberId: '01938f6e-9000-7000-8000-0000000000c3',
} as const;

/** Léa Petit (LP), whose join is delivered twice. */
const leaPetit = {
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c27',
  memberId: '01938f6e-9000-7000-8000-0000000000c4',
} as const;

/** Membership id of Hugo Dubois, owner of the other organization. */
const hugoOtherMemberId = '01938f6e-9000-7000-8000-0000000000c5';

/**
 * Léa Petit in the other organization, whose join is published with upper-case ids: the copy keeps
 * them lower-case.
 */
const leaOtherMemberId = '01938f6e-9000-7000-8000-0000000000ca';

/** A membership of Léa Petit whose first insert races a role change. */
const leaRacingMemberId = '01938f6e-9000-7000-8000-0000000000cb';

/** A second, `guest` membership of Hugo Dubois: the one a re-join would create. */
const hugoGuestMemberId = '01938f6e-9000-7000-8000-0000000000cc';

/** The `guest` membership Inès Robert gets when she joins again after her removal. */
const inesGuestMemberId = '01938f6e-9000-7000-8000-0000000000cd';

/** The `admin` membership she gets after that, whose removal is still to arrive. */
const inesAdminMemberId = '01938f6e-9000-7000-8000-0000000000ce';

/** The three durable consumers, by handler, with the event each filters. */
const consumers = [
  { handler: 'project-member-joined', event: 'member.joined.v1' },
  { handler: 'project-member-role-changed', event: 'member.role-changed.v1' },
  { handler: 'project-member-removed', event: 'member.removed.v1' },
] as const;

/** Which member event. */
type MemberEventKind = 'joined' | 'role-changed' | 'removed';

/** A member event as organization-service emits it. */
interface MemberEvent {
  readonly kind: MemberEventKind;
  readonly organizationId: string;
  readonly person: { readonly userId: string; readonly memberId: string };
  readonly role: MemberRole;
  readonly version: number;
  /** For a role change: the role before it, `member` when omitted. */
  readonly previousRole?: MemberRole;
}

/** A member event after its publication: the same body can be published again. */
interface PublishedEvent {
  readonly id: string;
  readonly kind: MemberEventKind;
  readonly body: string;
}

/** What the durable consumer reports to the `admin` user (`nats consumer info --json`). */
interface ConsumerInfo {
  readonly config: {
    readonly max_deliver: number;
    readonly deliver_policy: string;
    readonly filter_subject: string;
  };
  readonly delivered: { readonly consumer_seq: number };
  readonly ack_floor: { readonly consumer_seq: number };
  readonly num_ack_pending: number;
  readonly num_redelivered: number;
  readonly num_pending: number;
}

/** A row of `organization_members`, as the specs read it. */
interface MemberRow {
  readonly user_id: string;
  readonly role: MemberRole;
  readonly version: number;
  readonly removed_at: Date | null;
  readonly updated_at: Date;
}

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
      env: { ...process.env, DEV_POSTGRES_PORT: '0', DEV_NATS_PORT: '0' },
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
 * Runs the NATS command line like `brokerAccepts` and returns everything it wrote, whatever its exit
 * code: `nats request` exits 0 when the broker refuses the publication, and says so only in its
 * output.
 *
 * @param env - Variables that replace the `admin` credentials of the container for this call.
 * @param args - Arguments of the `nats` command.
 * @returns The standard output followed by the standard error.
 */
function brokerOutput(env: Readonly<Record<string, string>>, ...args: readonly string[]): string {
  const variables = Object.entries(env).flatMap(([name, value]) => ['--env', `${name}=${value}`]);
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--project-name',
      project,
      '--file',
      composeFile,
      'exec',
      '-T',
      ...variables,
      'nats-streams',
      'nats',
      '--timeout',
      '2s',
      ...args,
    ],
    { encoding: 'utf8', env: { ...process.env, DEV_POSTGRES_PORT: '0', DEV_NATS_PORT: '0' } },
  );
  return `${result.stdout}${result.stderr}`;
}

/** The credentials of the `task` user, with the inbox prefix its grants require. */
const task = { NATS_USER: 'task', NATS_PASSWORD: 'task' } as const;

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
 * Reads a durable consumer of `EVENTS` as the `admin` user.
 *
 * @param handler - The handler of the consumer, after `task-service__`.
 * @returns What the broker reports.
 */
function consumerInfo(handler: string): ConsumerInfo {
  return JSON.parse(
    compose(
      'exec',
      '-T',
      'nats-streams',
      'nats',
      'consumer',
      'info',
      'EVENTS',
      `task-service__${handler}`,
      '--json',
    ),
  ) as ConsumerInfo;
}

/**
 * Builds a member event as organization-service emits it, with a new event id.
 *
 * @param event - The event.
 * @returns Its id and its JSON body.
 */
function toPublishedEvent(event: MemberEvent): PublishedEvent {
  const id = randomUUID();
  const common = {
    id,
    occurredAt: new Date().toISOString(),
    organizationId: event.organizationId,
    version: event.version,
    memberId: event.person.memberId,
    userId: event.person.userId,
    role: event.role,
  };
  let payload: MemberJoinedV1 | MemberRoleChangedV1 | MemberRemovedV1;
  switch (event.kind) {
    case 'joined':
      // The actor of a join is the account that joined; no invitation for these members.
      payload = { ...common, actor: { type: 'user', id: event.person.userId }, invitationId: null };
      break;
    case 'role-changed':
      // Changed by Camille Martin, the owner. The module never reads `previousRole`.
      payload = {
        ...common,
        actor: { type: 'user', id: camilleMartin.userId },
        previousRole: event.previousRole ?? 'member',
      };
      break;
    case 'removed':
      payload = { ...common, actor: { type: 'user', id: camilleMartin.userId } };
      break;
  }
  return { id, kind: event.kind, body: JSON.stringify(payload) };
}

/**
 * Publishes a member event on its `evt.` subject with the `admin` user, waiting for the
 * acknowledgement of the stream.
 *
 * @param published - The event.
 * @param messageId - The `Nats-Msg-Id`: the broker drops a second message with the same one within
 * its duplicate window, so a redelivery of the same event takes another.
 */
function publish(published: PublishedEvent, messageId: string): void {
  compose(
    'exec',
    '-T',
    'nats-streams',
    'nats',
    'pub',
    '--jetstream',
    '--header',
    `Nats-Msg-Id:${messageId}`,
    `evt.member.${published.kind}.v1`,
    published.body,
  );
}

/**
 * Publishes a member event and waits until its consumer has delivered it and acknowledged
 * everything it delivered, so that the copy holds the outcome of the event, applied or ignored.
 *
 * @param published - The event, new or already published.
 * @param messageId - The `Nats-Msg-Id`.
 */
async function deliver(published: PublishedEvent, messageId: string): Promise<void> {
  const handler = `project-member-${published.kind}`;
  const before = consumerInfo(handler).delivered.consumer_seq;
  publish(published, messageId);
  await vi.waitFor(() => {
    const info = consumerInfo(handler);
    expect(info.delivered.consumer_seq).toBeGreaterThan(before);
    expect(info.ack_floor.consumer_seq).toBe(info.delivered.consumer_seq);
    expect(info.num_ack_pending).toBe(0);
    expect(info.num_pending).toBe(0);
  }, waitOptions);
}

/**
 * Publishes a new member event and waits for its outcome.
 *
 * @param event - The event.
 * @returns The published event, to publish again.
 */
async function emit(event: MemberEvent): Promise<PublishedEvent> {
  const published = toPublishedEvent(event);
  await deliver(published, published.id);
  return published;
}

/**
 * Creates the public key of a trusted issuer: the configuration requires one, and no request is
 * sent in this spec.
 *
 * @returns The public key for the verifier.
 */
function trustedIssuerKey(): Ed25519PublicJwk {
  const { x } = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
  if (x === undefined) {
    throw new Error('Node returned an Ed25519 JWK without its key material.');
  }
  return { kty: 'OKP', crv: 'Ed25519', x, kid: 'test-api-gateway' };
}

/**
 * The organization context of the actor of a request, as the internal token gives it.
 *
 * @param organizationId - Organization of the context.
 * @returns The context the tenant runner reads.
 */
function contextOf(organizationId: string): OrganizationContext {
  return {
    organizationId,
    actor: { type: 'user', id: camilleMartin.userId },
    role: null,
    scopes: [],
  };
}

describe('organization members copy', () => {
  let app: NestExpressApplication | undefined;
  let migrator: pg.Pool;

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

  /**
   * Runs work in the tenant transaction of an organization, as the module of a request would.
   *
   * @param organizationId - Organization of the context.
   * @param work - Work that receives the transaction.
   * @returns What the work returns.
   */
  async function inTenant<T>(
    organizationId: string,
    work: (client: TransactionClient) => Promise<T>,
  ): Promise<T> {
    const tenant = service().get(TenantTransactionRunner);
    return runWithOrganizationContext(contextOf(organizationId), () =>
      tenant.run((tx) => work(tx.client)),
    );
  }

  /**
   * Reads the current membership of an account, through `FindOrganizationMember`.
   *
   * @param organizationId - Organization of the context, which the query also names.
   * @param userId - The account.
   * @returns The membership, or `null`.
   */
  async function findMember(
    organizationId: string,
    userId: string,
  ): Promise<{ readonly memberId: string; readonly role: MemberRole } | null> {
    const query = service().get(FindOrganizationMember);
    return inTenant(organizationId, () => query.execute({ organizationId, userId }));
  }

  /**
   * Reads the owner of an organization, through `FindOrganizationOwner`.
   *
   * @param organizationId - Organization of the context, which the query also names.
   * @returns The owner, or `null`.
   */
  async function findOwner(
    organizationId: string,
  ): Promise<{ readonly memberId: string; readonly userId: string } | null> {
    const query = service().get(FindOrganizationOwner);
    return inTenant(organizationId, () => query.execute({ organizationId }));
  }

  /**
   * Reads a stored membership as the migrator role. Row-level security is forced on the table, so
   * the transaction sets the system access of the policy, as the system runner of the application
   * does.
   *
   * @param organizationId - Organization of the row.
   * @param memberId - Id of the membership.
   * @returns The row, or `null`.
   */
  async function storedMember(organizationId: string, memberId: string): Promise<MemberRow | null> {
    const client = await migrator.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.system_access', 'on', true)`);
      const result = await client.query<MemberRow>(
        `select user_id, role, version::int as version, removed_at, updated_at
           from organization_members where organization_id = $1 and id = $2`,
        [organizationId, memberId],
      );
      await client.query('commit');
      return result.rows[0] ?? null;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Counts the lock requests of the database that wait for another transaction. Read from
   * `pg_locks`, which the migrator role sees for every session, unlike the wait events of
   * `pg_stat_activity`, which a role sees only for its own.
   *
   * @returns The number of lock requests not granted yet.
   */
  async function waitingLocks(): Promise<number> {
    const result = await migrator.query<{ waiting: number }>(
      'select count(*)::int as waiting from pg_locks where not granted',
    );
    return result.rows[0]?.waiting ?? 0;
  }

  beforeAll(async () => {
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
    const postgresPort = hostPort('postgres', '5432');
    const natsPort = hostPort('nats', '4222');

    vi.stubEnv(
      'MIGRATION_DATABASE_URL',
      `postgres://task_migrator:task_migrator@127.0.0.1:${postgresPort}/task`,
    );
    vi.resetModules();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await import('../src/migrate.js');
    } finally {
      log.mockRestore();
    }
    migrator = new pg.Pool({
      connectionString: `postgres://task_migrator:task_migrator@127.0.0.1:${postgresPort}/task`,
      max: 2,
    });

    // The consumers do not exist yet: what is published now is history the service must still read.
    for (const { handler } of consumers) {
      expect(
        brokerAccepts({}, 'consumer', 'info', 'EVENTS', `task-service__${handler}`),
        `the consumer ${handler} existed before the service started`,
      ).toBe(false);
    }
    const owner = toPublishedEvent({
      kind: 'joined',
      organizationId: atelierNordId,
      person: camilleMartin,
      role: 'owner',
      version: 1,
    });
    publish(owner, owner.id);

    vi.stubEnv('PORT', '3013');
    vi.stubEnv('LOG_PRETTY', 'false');
    vi.stubEnv('DATABASE_URL', `postgres://task_app:task_app@127.0.0.1:${postgresPort}/task`);
    vi.stubEnv('NATS_URL', `nats://127.0.0.1:${natsPort}`);
    vi.stubEnv('NATS_USER', 'task');
    vi.stubEnv('NATS_PASSWORD', 'task');
    vi.stubEnv('INTERNAL_TOKEN_AUDIENCE', 'task-service');
    vi.stubEnv(
      'INTERNAL_TOKEN_TRUSTED_ISSUERS',
      JSON.stringify({ 'api-gateway': [trustedIssuerKey()] }),
    );

    // As main.ts: the configuration is read inside the start-up, never when a module is imported.
    const config = loadConfig(appConfigSchema);
    app = await createApplication(AppModule, {
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
  });

  afterAll(async () => {
    try {
      await app?.close();
      await migrator.end();
    } finally {
      vi.unstubAllEnvs();
      compose('down', '--volumes', '--remove-orphans');
    }
  });

  describe('history the stream holds before the consumers exist (deliverPolicy all)', () => {
    it('copies the owner who joined before the service started, with the role of the event', async () => {
      await vi.waitFor(async () => {
        expect(await findMember(atelierNordId, camilleMartin.userId)).toEqual({
          memberId: camilleMartin.memberId,
          role: 'owner',
        });
      }, waitOptions);

      expect(await findOwner(atelierNordId)).toEqual({
        memberId: camilleMartin.memberId,
        userId: camilleMartin.userId,
      });
    });

    it('keeps one durable consumer per member event, each with 32 deliveries and the whole history', () => {
      for (const { handler, event } of consumers) {
        const { config } = consumerInfo(handler);

        expect(config).toMatchObject({
          max_deliver: 32,
          deliver_policy: 'all',
          filter_subject: `evt.${event}`,
        });
      }
    });
  });

  describe('the life of a membership: join, role change, removal', () => {
    it('copies a member who joins after the start, with the role of the event', async () => {
      await emit({
        kind: 'joined',
        organizationId: atelierNordId,
        person: inesRobert,
        role: 'member',
        version: 1,
      });

      expect(await findMember(atelierNordId, inesRobert.userId)).toEqual({
        memberId: inesRobert.memberId,
        role: 'member',
      });
    });

    it('takes the role of a role change of a higher version', async () => {
      await emit({
        kind: 'role-changed',
        organizationId: atelierNordId,
        person: inesRobert,
        role: 'admin',
        version: 2,
      });

      expect(await findMember(atelierNordId, inesRobert.userId)).toEqual({
        memberId: inesRobert.memberId,
        role: 'admin',
      });
      expect(await storedMember(atelierNordId, inesRobert.memberId)).toMatchObject({
        role: 'admin',
        version: 2,
        removed_at: null,
      });
    });

    it('answers as for a non-member after a removal, and keeps the row marked removed', async () => {
      await emit({
        kind: 'removed',
        organizationId: atelierNordId,
        person: inesRobert,
        role: 'admin',
        version: 3,
      });

      expect(await findMember(atelierNordId, inesRobert.userId)).toBeNull();
      const row = await storedMember(atelierNordId, inesRobert.memberId);
      expect(row).toMatchObject({ role: 'admin', version: 3 });
      expect(row?.removed_at).toBeInstanceOf(Date);
    });

    it('does not bring a removed member back when a late join of a lower version arrives', async () => {
      await emit({
        kind: 'joined',
        organizationId: atelierNordId,
        person: inesRobert,
        role: 'member',
        version: 1,
      });

      expect(await findMember(atelierNordId, inesRobert.userId)).toBeNull();
      const row = await storedMember(atelierNordId, inesRobert.memberId);
      expect(row).toMatchObject({ role: 'admin', version: 3 });
      expect(row?.removed_at).toBeInstanceOf(Date);
    });
  });

  describe('events that arrive out of order', () => {
    it('keeps the role of the highest version when an older role change arrives late', async () => {
      await emit({
        kind: 'joined',
        organizationId: atelierNordId,
        person: hugoDubois,
        role: 'member',
        version: 1,
      });
      await emit({
        kind: 'role-changed',
        organizationId: atelierNordId,
        person: hugoDubois,
        role: 'admin',
        version: 3,
      });
      expect(await findMember(atelierNordId, hugoDubois.userId)).toMatchObject({ role: 'admin' });

      await emit({
        kind: 'role-changed',
        organizationId: atelierNordId,
        person: hugoDubois,
        role: 'guest',
        version: 2,
      });

      expect(await findMember(atelierNordId, hugoDubois.userId)).toEqual({
        memberId: hugoDubois.memberId,
        role: 'admin',
      });
      expect(await storedMember(atelierNordId, hugoDubois.memberId)).toMatchObject({
        role: 'admin',
        version: 3,
        removed_at: null,
      });
    });
  });

  describe('redelivery of an event', () => {
    it('applies an event once when it is delivered again with the same event id', async () => {
      const joined = await emit({
        kind: 'joined',
        organizationId: atelierNordId,
        person: leaPetit,
        role: 'member',
        version: 1,
      });
      const before = await storedMember(atelierNordId, leaPetit.memberId);
      expect(before).toMatchObject({ role: 'member', version: 1, removed_at: null });

      // Another broker message id, or the duplicate window of the stream would drop the second one.
      await deliver(joined, `${joined.id}-again`);

      const processed = await migrator.query<{ rows: number }>(
        `select count(*)::int as rows from processed_events
          where consumer = 'task-service__project-member-joined' and event_id = $1`,
        [joined.id],
      );
      expect(processed.rows).toEqual([{ rows: 1 }]);
      expect(await storedMember(atelierNordId, leaPetit.memberId)).toEqual(before);
      expect(await findMember(atelierNordId, leaPetit.userId)).toEqual({
        memberId: leaPetit.memberId,
        role: 'member',
      });
    });
  });

  describe('isolation between organizations under row-level security', () => {
    it('shows each organization its own members and owner only, though the other holds the same account and membership id', async () => {
      await emit({
        kind: 'joined',
        organizationId: otherOrganizationId,
        person: { userId: hugoDubois.userId, memberId: hugoOtherMemberId },
        role: 'owner',
        version: 1,
      });
      await emit({
        kind: 'joined',
        organizationId: otherOrganizationId,
        person: camilleMartin,
        role: 'guest',
        version: 1,
      });

      expect(await findOwner(atelierNordId)).toEqual({
        memberId: camilleMartin.memberId,
        userId: camilleMartin.userId,
      });
      expect(await findOwner(otherOrganizationId)).toEqual({
        memberId: hugoOtherMemberId,
        userId: hugoDubois.userId,
      });
      expect(await findMember(atelierNordId, camilleMartin.userId)).toEqual({
        memberId: camilleMartin.memberId,
        role: 'owner',
      });
      expect(await findMember(otherOrganizationId, camilleMartin.userId)).toEqual({
        memberId: camilleMartin.memberId,
        role: 'guest',
      });
      expect(await findMember(atelierNordId, hugoDubois.userId)).toMatchObject({ role: 'admin' });
      expect(await findMember(otherOrganizationId, hugoDubois.userId)).toMatchObject({
        role: 'owner',
      });
    });

    it('answers a query that names another organization as for a non-member', async () => {
      const members = service().get(FindOrganizationMember);
      const owners = service().get(FindOrganizationOwner);

      const member = await inTenant(atelierNordId, () =>
        members.execute({ organizationId: otherOrganizationId, userId: camilleMartin.userId }),
      );
      const owner = await inTenant(atelierNordId, () =>
        owners.execute({ organizationId: otherOrganizationId }),
      );

      expect(member).toBeNull();
      expect(owner).toBeNull();
    });

    it('returns only the rows of its organization to a direct select of the tenant transaction', async () => {
      const read = (organizationId: string): Promise<readonly string[]> =>
        inTenant(organizationId, async (client) => {
          const result = await client.query('select organization_id from organization_members');
          const rows = result.rows as readonly { readonly organization_id: string }[];
          return rows.map((row) => row.organization_id);
        });

      const atelierNord = await read(atelierNordId);
      const other = await read(otherOrganizationId);

      expect(atelierNord.length).toBeGreaterThanOrEqual(4);
      expect(new Set(atelierNord)).toEqual(new Set([atelierNordId]));
      expect(other).toEqual([otherOrganizationId, otherOrganizationId]);
    });

    it('refuses with 42501 a row for another organization written from a tenant transaction', async () => {
      await expect(
        inTenant(atelierNordId, (client) =>
          client.query(
            `insert into organization_members (organization_id, id, user_id, role, version)
             values ($1, $2, $3, 'member', 1)`,
            [otherOrganizationId, randomUUID(), leaPetit.userId],
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('a removal that names another account than the copy', () => {
    it('still ends the membership and keeps the stored account', async () => {
      await emit({
        kind: 'removed',
        organizationId: atelierNordId,
        person: { userId: hugoDubois.userId, memberId: leaPetit.memberId },
        role: 'member',
        version: 2,
      });

      expect(await findMember(atelierNordId, leaPetit.userId)).toBeNull();
      const row = await storedMember(atelierNordId, leaPetit.memberId);
      expect(row).toMatchObject({ user_id: leaPetit.userId, version: 2 });
      expect(row?.removed_at).toBeInstanceOf(Date);
      expect(await findMember(atelierNordId, hugoDubois.userId)).toMatchObject({ role: 'admin' });
    });
  });

  describe('ids that arrive in upper case', () => {
    it('stores them in lower case, so that a later lower-case event finds the same membership', async () => {
      await emit({
        kind: 'joined',
        organizationId: otherOrganizationId.toUpperCase(),
        person: {
          userId: leaPetit.userId.toUpperCase(),
          memberId: leaOtherMemberId.toUpperCase(),
        },
        role: 'member',
        version: 1,
      });

      expect(await storedMember(otherOrganizationId, leaOtherMemberId)).toMatchObject({
        user_id: leaPetit.userId,
        role: 'member',
        version: 1,
      });

      await emit({
        kind: 'role-changed',
        organizationId: otherOrganizationId,
        person: { userId: leaPetit.userId, memberId: leaOtherMemberId },
        role: 'admin',
        version: 2,
      });

      expect(await findMember(otherOrganizationId, leaPetit.userId)).toEqual({
        memberId: leaOtherMemberId,
        role: 'admin',
      });
    });
  });

  describe('two active memberships of one account', () => {
    it('answers the least privileged role when the guest membership arrives after the admin one', async () => {
      expect(await findMember(atelierNordId, hugoDubois.userId)).toMatchObject({ role: 'admin' });

      await emit({
        kind: 'joined',
        organizationId: atelierNordId,
        person: { userId: hugoDubois.userId, memberId: hugoGuestMemberId },
        role: 'guest',
        version: 1,
      });

      expect(await findMember(atelierNordId, hugoDubois.userId)).toEqual({
        memberId: hugoGuestMemberId,
        role: 'guest',
      });
    });

    it('answers the least privileged role when the admin membership arrives after the guest one', async () => {
      await emit({
        kind: 'joined',
        organizationId: atelierNordId,
        person: { userId: inesRobert.userId, memberId: inesGuestMemberId },
        role: 'guest',
        version: 1,
      });
      await emit({
        kind: 'joined',
        organizationId: atelierNordId,
        person: { userId: inesRobert.userId, memberId: inesAdminMemberId },
        role: 'admin',
        version: 1,
      });

      expect(await findMember(atelierNordId, inesRobert.userId)).toEqual({
        memberId: inesGuestMemberId,
        role: 'guest',
      });
    });
  });

  describe('the first insert of a membership that two events handle at once', () => {
    it('waits for the transaction that inserted it, then applies the higher version on the stored row', async () => {
      const tenant = service().get(TenantTransactionRunner);
      const apply = service().get(ApplyMembershipChange);
      let inserted: () => void = () => undefined;
      const insertedFirst = new Promise<void>((resolve) => {
        inserted = resolve;
      });
      let release: () => void = () => undefined;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let applied = false;

      // The first transaction inserts the membership at version 1 and keeps it uncommitted.
      const first = runWithOrganizationContext(contextOf(atelierNordId), () =>
        tenant.run(async (tx) => {
          await tx.client.query(
            `insert into organization_members (organization_id, id, user_id, role, version)
             values ($1, $2, $3, 'member', 1)`,
            [atelierNordId, leaRacingMemberId, leaPetit.userId],
          );
          inserted();
          await released;
        }),
      );
      try {
        await insertedFirst;
        // The second does not see the row, so its insert waits on the key of the first.
        const second = runWithOrganizationContext(contextOf(atelierNordId), () =>
          apply.execute({
            kind: 'role-changed',
            organizationId: atelierNordId,
            memberId: leaRacingMemberId,
            userId: leaPetit.userId,
            role: 'admin',
            version: 2,
            occurredAt: new Date(),
          }),
        ).then(() => {
          applied = true;
        });

        await vi.waitFor(async () => {
          expect(await waitingLocks()).toBeGreaterThanOrEqual(1);
        }, waitOptions);
        expect(applied).toBe(false);
        expect(await storedMember(atelierNordId, leaRacingMemberId)).toBeNull();

        release();
        await Promise.all([first, second]);
      } finally {
        release();
        await first;
      }

      expect(applied).toBe(true);
      expect(await storedMember(atelierNordId, leaRacingMemberId)).toMatchObject({
        role: 'admin',
        version: 2,
        removed_at: null,
      });
    });
  });

  describe('the NATS grants of the task user', () => {
    const inbox = ['--inbox-prefix', '_INBOX.task'] as const;

    it('reads a consumer it is granted, by its exact name', () => {
      expect(
        brokerAccepts(
          task,
          ...inbox,
          'consumer',
          'info',
          'EVENTS',
          'task-service__project-member-joined',
        ),
      ).toBe(true);
    });

    it('creates and reads no consumer under a name it is not granted', () => {
      const name = 'task-service__not-granted';

      // Created by the task user: refused, and nothing exists afterwards.
      expect(
        brokerAccepts(
          task,
          ...inbox,
          'consumer',
          'add',
          'EVENTS',
          name,
          '--pull',
          '--filter',
          'evt.member.joined.v1',
          '--defaults',
        ),
      ).toBe(false);
      expect(brokerAccepts({}, 'consumer', 'info', 'EVENTS', name)).toBe(false);

      // Created by the admin: it exists, and the task user is still refused its information.
      expect(
        brokerAccepts(
          {},
          'consumer',
          'add',
          'EVENTS',
          name,
          '--pull',
          '--filter',
          'evt.member.joined.v1',
          '--defaults',
        ),
      ).toBe(true);
      try {
        expect(brokerAccepts({}, 'consumer', 'info', 'EVENTS', name)).toBe(true);
        expect(brokerAccepts(task, ...inbox, 'consumer', 'info', 'EVENTS', name)).toBe(false);
      } finally {
        brokerAccepts({}, 'consumer', 'rm', '--force', 'EVENTS', name);
      }
    });

    it('binds the creation of a granted consumer to its own filter', () => {
      const name = 'task-service__project-member-joined';
      const createSubject = `$JS.API.CONSUMER.CREATE.EVENTS.${name}`;
      const body = JSON.stringify({ stream_name: 'EVENTS', action: 'create' });
      const refusal = /permissions violation for publish to/iu;

      // The control: the broker lets the request through on the granted subject and answers it.
      expect(
        brokerOutput(task, ...inbox, 'request', `${createSubject}.evt.member.joined.v1`, body),
      ).not.toMatch(refusal);

      // The command line addresses `<name>.<filter>`: another filter is another subject, refused.
      const withAnotherFilter = brokerOutput(
        task,
        ...inbox,
        'consumer',
        'add',
        'EVENTS',
        name,
        '--pull',
        '--filter',
        'evt.user.email-changed.v1',
        '--defaults',
        '--trace',
      );
      expect(withAnotherFilter).toMatch(refusal);
      expect(withAnotherFilter).toContain(`"${createSubject}.evt.user.email-changed.v1"`);
      // The same name with no filter, through the durable endpoint, or under a wildcard: refused.
      for (const subject of [
        createSubject,
        `$JS.API.CONSUMER.DURABLE.CREATE.EVENTS.${name}`,
        `${createSubject}.evt.>`,
      ]) {
        expect(brokerOutput(task, ...inbox, 'request', subject, body), subject).toMatch(refusal);
      }

      // Nothing changed the consumer the service created.
      expect(consumerInfo('project-member-joined').config).toMatchObject({
        filter_subject: 'evt.member.joined.v1',
        max_deliver: 32,
      });
    });
  });

  // Last: the event of this test is never acknowledged, so its consumer keeps one message pending
  // and redelivers it for hours, which no later test of the file may wait on.
  describe('an event that the copy refuses', () => {
    it('leaves no processed id and no change behind: its transaction rolls back and the event stays pending', async () => {
      const before = await storedMember(atelierNordId, hugoDubois.memberId);
      expect(before).toMatchObject({ user_id: hugoDubois.userId, role: 'admin', version: 3 });
      const poison = toPublishedEvent({
        kind: 'role-changed',
        organizationId: atelierNordId,
        // The membership of Hugo Dubois, named with the account of Léa Petit: a mismatch.
        person: { userId: leaPetit.userId, memberId: hugoDubois.memberId },
        role: 'guest',
        version: 9,
      });
      const delivered = consumerInfo('project-member-role-changed').delivered.consumer_seq;

      publish(poison, poison.id);

      // Delivered, refused, and delivered again: never acknowledged.
      await vi.waitFor(() => {
        const info = consumerInfo('project-member-role-changed');
        expect(info.delivered.consumer_seq).toBeGreaterThan(delivered);
        expect(info.num_redelivered).toBeGreaterThanOrEqual(1);
        expect(info.num_ack_pending).toBe(1);
      }, waitOptions);

      const processed = await migrator.query<{ rows: number }>(
        `select count(*)::int as rows from processed_events
          where consumer = 'task-service__project-member-role-changed' and event_id = $1`,
        [poison.id],
      );
      expect(processed.rows).toEqual([{ rows: 0 }]);
      expect(await storedMember(atelierNordId, hugoDubois.memberId)).toEqual(before);
    });
  });
});
