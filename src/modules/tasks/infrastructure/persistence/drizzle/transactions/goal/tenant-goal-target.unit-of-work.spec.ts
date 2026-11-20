import { runWithOrganizationContext } from '@cadenway/nest-common';
import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { TransactionOptions } from '@cadenway/nest-common/database';
import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { TenantGoalTargetUnitOfWork } from './tenant-goal-target.unit-of-work.js';

const organizationId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const userId = '019a5f3c-9e1f-7b2a-8c3d-4e5f6a7b8c31';

describe('TenantGoalTargetUnitOfWork', () => {
  it.each([
    { transaction: 'write', options: {}, begin: 'BEGIN' },
    {
      transaction: 'read snapshot',
      options: { readOnly: true, isolationLevel: 'repeatable read' } satisfies TransactionOptions,
      begin: 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
    },
  ])('reads measurements within the enclosing goal $transaction', async ({ options, begin }) => {
    const query = vi.fn((statement: string) => Promise.resolve({ command: statement, rows: [] }));
    const connection = Object.assign(new EventEmitter(), { query, release: vi.fn() });
    const connect = vi.fn(() => Promise.resolve(connection));
    const runner = new TenantTransactionRunner({ connect } as unknown as Pool);
    const targets = new TenantGoalTargetUnitOfWork(runner);

    const result = await runWithOrganizationContext(
      { organizationId, actor: { type: 'user', id: userId }, role: null, scopes: [] },
      () =>
        runner.run(
          () => targets.read((reader) => reader.milestones(organizationId, [], false)),
          options,
        ),
    );

    expect(result).toEqual([]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenNthCalledWith(1, begin);
    expect(query).toHaveBeenLastCalledWith('COMMIT');
  });
});
