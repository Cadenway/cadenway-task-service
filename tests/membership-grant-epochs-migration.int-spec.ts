import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('membership-scoped grants upgrade', () => {
  let container = '';
  let pool: pg.Pool | undefined;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const owner = randomUUID();
  const spaceId = randomUUID();
  const safe = { userId: randomUUID(), memberId: randomUUID() };
  const rejoined = { userId: randomUUID(), previousId: randomUUID(), memberId: randomUUID() };
  const olderGrant = { userId: randomUUID(), memberId: randomUUID() };
  const removed = { userId: randomUUID(), memberId: randomUUID() };

  beforeAll(async () => {
    container = execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--pull',
        'never',
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
    pool = new pg.Pool({
      host: '127.0.0.1',
      port: Number(address.slice(address.lastIndexOf(':') + 1)),
      user: 'postgres',
      password: 'fixture',
    });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        await pool.query('select 1');
        break;
      } catch (error: unknown) {
        if (attempt === 59) throw error;
        await setTimeout(500);
      }
    }

    // Apply the actual pre-upgrade schemas, then create grants as the old version wrote them.
    for (const file of [
      '0001_organization_members.sql',
      '0002_spaces_and_lists.sql',
      '0005_access_grants.sql',
    ]) {
      await pool.query(readFileSync(`migrations/${file}`, 'utf8'));
    }
    await pool.query(
      `insert into spaces (organization_id, id, name, prefix, color, visibility, owner_user_id, statuses)
       values ($1, $2, 'Recherche', 'RCH', 'violet', 'private', $3, '[]')`,
      [organizationId, spaceId, owner],
    );
    await pool.query(
      `insert into organization_members (organization_id, id, user_id, role, version, created_at, removed_at)
       values ($1, $2, $3, 'member', 1, '2026-01-01', null),
              ($1, $4, $5, 'member', 2, '2026-01-01', '2026-01-05'),
              ($1, $6, $5, 'member', 1, '2026-01-06', null),
              ($1, $7, $8, 'member', 1, '2026-01-10', null),
              ($1, $9, $10, 'member', 2, '2026-01-01', '2026-01-05')`,
      [
        organizationId,
        safe.memberId,
        safe.userId,
        rejoined.previousId,
        rejoined.userId,
        rejoined.memberId,
        olderGrant.memberId,
        olderGrant.userId,
        removed.memberId,
        removed.userId,
      ],
    );
    await pool.query(
      `insert into space_grants (organization_id, space_id, user_id, role, granted_by_type, granted_by_id, granted_at)
       select $1, $2, grantee, 'view', 'user', $3, '2026-01-09'
         from unnest($4::uuid[]) as grantee`,
      [
        organizationId,
        spaceId,
        owner,
        [safe.userId, rejoined.userId, olderGrant.userId, removed.userId],
      ],
    );
    await pool.query(readFileSync('migrations/0022_membership_grant_epochs.sql', 'utf8'));
    await pool.query('create role grant_epoch_tester nologin');
    await pool.query('grant select on organization_members, space_grants to grant_epoch_tester');
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    if (container !== '') execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  });

  it('retains only proven legacy grants and honors tenant isolation', async () => {
    if (pool === undefined) throw new Error('PostgreSQL was not started.');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role grant_epoch_tester');
      await client.query(`select set_config('app.organization_id', $1, true)`, [organizationId]);
      const grants = await client.query<{
        readonly user_id: string;
        readonly member_id: string | null;
        readonly effective: boolean;
      }>(
        `select user_id::text, member_id::text,
                public.organization_member_grant_is_effective(organization_id, user_id, member_id, granted_at) as effective
           from space_grants where organization_id = $1 order by user_id`,
        [organizationId],
      );
      expect(grants.rows).toHaveLength(4);
      expect(grants.rows.every((grant) => grant.member_id === null)).toBe(true);
      expect(grants.rows.find((grant) => grant.user_id === safe.userId)?.effective).toBe(true);
      for (const userId of [rejoined.userId, olderGrant.userId, removed.userId]) {
        expect(grants.rows.find((grant) => grant.user_id === userId)?.effective).toBe(false);
      }

      await client.query(`select set_config('app.organization_id', $1, true)`, [
        otherOrganizationId,
      ]);
      const foreign = await client.query<{ readonly effective: boolean }>(
        `select public.organization_member_grant_is_effective($1, $2, null, '2026-01-09') as effective`,
        [organizationId, safe.userId],
      );
      expect(foreign.rows[0]?.effective).toBe(false);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});
