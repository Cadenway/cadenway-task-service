import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleNotificationDeliveryDecisionRepository } from './drizzle-notification-delivery-decision.repository.js';
import type { NotificationDeliveryDecision } from '../../../../../application/models/delivery-authorization/notification-delivery-decision.model.js';
import { DecideNotificationDeliveryAuthorization } from '../../../../../application/use-cases/commands/delivery-authorization/decide-notification-delivery-authorization/decide-notification-delivery-authorization.use-case.js';

const ORGANIZATION = '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10';
const OTHER_ORGANIZATION = '01938f6e-0000-7000-8000-000000000002';
const REQUEST = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1a24';
const RECIPIENT = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const EVENT = '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d13';

const decision: NotificationDeliveryDecision = {
  organizationId: ORGANIZATION,
  authorizationRequestId: REQUEST,
  recipientId: RECIPIENT,
  subjectKind: 'task-key',
  subjectValue: 'CAD-482',
  expiresAt: new Date('2026-11-20T17:00:30.000Z'),
  decision: 'permit',
  decidedAt: new Date('2026-11-20T17:00:00.000Z'),
  validUntil: new Date('2026-11-20T17:00:15.000Z'),
  eventId: EVENT,
  eventVersion: 1,
};

describe('notification delivery decision persistence', () => {
  let container = '';
  let pool: pg.Pool | undefined;

  beforeAll(async () => {
    container = execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '-e',
        'POSTGRES_PASSWORD=fixture',
        '-p',
        '127.0.0.1::5432',
        'postgres:18.6-alpine@sha256:9ba53c7d41ea093baf5c1ba635ba5434c4f979880527d49bb7d9237d3193085b',
      ],
      { encoding: 'utf8' },
    ).trim();
    const address = execFileSync('docker', ['port', container, '5432/tcp'], {
      encoding: 'utf8',
    }).trim();
    const port = Number(address.slice(address.lastIndexOf(':') + 1));
    pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'fixture' });
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
      try {
        await pool.query('select 1');
        ready = true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (!ready) throw new Error('The disposable PostgreSQL did not start.');

    const migration = readFileSync('migrations/0019_notification_delivery_decisions.sql', 'utf8');
    const platform = readFileSync('migrations/0000_platform_tables.sql', 'utf8');
    await pool.query(platform.replaceAll('--> statement-breakpoint', ''));
    await pool.query(migration.replaceAll('--> statement-breakpoint', ''));
    await pool.query(
      'create role task_test_app; grant select, insert on notification_delivery_authorization_decisions, outbox_events to task_test_app',
    );
  });

  it('rolls back a stale repeatable-read decision and reuses the committed decision on retry', async () => {
    if (pool === undefined) throw new Error('The PostgreSQL pool is unavailable.');
    const first = await pool.connect();
    const second = await pool.connect();
    const correlation = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1a25';
    const winningEvent = '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d14';
    const losingEvent = '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d15';
    const input = {
      organizationId: ORGANIZATION,
      authorizationRequestId: correlation,
      recipientId: RECIPIENT,
      subject: { kind: 'task-key' as const, reference: 'CAD-482' },
      expiresAt: new Date('2026-11-20T17:00:30.000Z'),
    };
    const createOperation = (client: pg.PoolClient, eventId: string) => {
      const repository = new DrizzleNotificationDeliveryDecisionRepository(drizzle(client));
      return new DecideNotificationDeliveryAuthorization(
        (work) =>
          work(repository, async (fact) => {
            await client.query(
              `insert into outbox_events (id, event_name, subject, stream, organization_id, payload)
               values ($1, 'task.notification-delivery-authorized.v1',
                 'evt.task.notification-delivery-authorized.v1', 'EVENTS', $2, $3::jsonb)`,
              [eventId, ORGANIZATION, JSON.stringify(fact)],
            );
            return { id: eventId };
          }),
        { execute: () => Promise.resolve([{ visible: true }]) },
        () => Date.parse('2026-11-20T17:00:00.000Z'),
      );
    };
    const begin = async (client: pg.PoolClient): Promise<void> => {
      await client.query('begin isolation level repeatable read');
      await client.query('set local role task_test_app');
      await client.query("select set_config('app.organization_id', $1, true)", [ORGANIZATION]);
    };
    try {
      await begin(first);
      await begin(second);
      // Pin the second snapshot before the winner commits.
      await second.query('select count(*) from notification_delivery_authorization_decisions');
      const matchingMembership = (): Promise<boolean> => Promise.resolve(true);
      await createOperation(first, winningEvent).execute(
        input,
        new AbortController().signal,
        matchingMembership,
      );

      let acquired = false;
      const stale = createOperation(second, losingEvent)
        .execute(input, new AbortController().signal, matchingMembership)
        .finally(() => {
          acquired = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(acquired).toBe(false);
      await first.query('commit');
      const failure: unknown = await stale.then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      const cause = failure instanceof Error ? failure.cause : null;
      if (!(cause instanceof Error) || !('code' in cause)) {
        throw new Error('The stale transaction did not report a PostgreSQL conflict.');
      }
      expect(['23505', '40001']).toContain(cause.code);
      await second.query('rollback');

      await begin(second);
      await createOperation(second, losingEvent).execute(
        input,
        new AbortController().signal,
        matchingMembership,
      );
      const bindings = await second.query(
        'select event_id from notification_delivery_authorization_decisions where authorization_request_id = $1',
        [correlation],
      );
      const events = await second.query(
        "select id from outbox_events where payload->>'authorizationRequestId' = $1",
        [correlation],
      );
      expect(bindings.rows).toEqual([{ event_id: winningEvent }]);
      expect(events.rows).toEqual([{ id: winningEvent }]);
      await second.query('commit');
    } finally {
      await first.query('rollback');
      await second.query('rollback');
      first.release();
      second.release();
    }
  });

  afterAll(async () => {
    await pool?.end();
    if (container !== '') execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  });

  it('serializes concurrent first decisions and rolls back unsuccessful writes', async () => {
    if (pool === undefined) throw new Error('The PostgreSQL pool is unavailable.');
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query('begin');
      await first.query('set local role task_test_app');
      await first.query("select set_config('app.organization_id', $1, true)", [ORGANIZATION]);
      await second.query('begin');
      await second.query('set local role task_test_app');
      await second.query("select set_config('app.organization_id', $1, true)", [ORGANIZATION]);
      const one = new DrizzleNotificationDeliveryDecisionRepository(drizzle(first));
      const two = new DrizzleNotificationDeliveryDecisionRepository(drizzle(second));
      await one.lock(ORGANIZATION, REQUEST.toUpperCase());
      expect(await one.find(ORGANIZATION, REQUEST)).toBeNull();
      await one.insert(decision);

      let acquired = false;
      const next = two.lock(ORGANIZATION, REQUEST).then(() => {
        acquired = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(acquired).toBe(false);
      await first.query('commit');
      await next;
      expect(await two.find(ORGANIZATION, REQUEST)).toEqual(decision);
      await second.query('rollback');

      await first.query('begin');
      await first.query('set local role task_test_app');
      await first.query("select set_config('app.organization_id', $1, true)", [ORGANIZATION]);
      await one.insert({ ...decision, authorizationRequestId: EVENT });
      await first.query('rollback');
      await first.query('begin');
      await first.query('set local role task_test_app');
      await first.query("select set_config('app.organization_id', $1, true)", [ORGANIZATION]);
      expect(await one.find(ORGANIZATION, EVENT)).toBeNull();
      await first.query('commit');
    } finally {
      first.release();
      second.release();
    }
  });

  it('cannot read or insert a decision in another organization', async () => {
    if (pool === undefined) throw new Error('The PostgreSQL pool is unavailable.');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role task_test_app');
      await client.query("select set_config('app.organization_id', $1, true)", [
        OTHER_ORGANIZATION,
      ]);
      const repository = new DrizzleNotificationDeliveryDecisionRepository(drizzle(client));
      expect(await repository.find(ORGANIZATION, REQUEST)).toBeNull();
      await expect(
        repository.insert({ ...decision, authorizationRequestId: EVENT }),
      ).rejects.toThrow();
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});
