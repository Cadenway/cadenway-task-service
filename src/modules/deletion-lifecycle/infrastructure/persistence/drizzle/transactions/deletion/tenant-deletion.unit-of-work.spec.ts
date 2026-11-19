import type { TenantTransactionRunner, TransactionOptions } from '@cadenway/nest-common/database';
import { describe, expect, it } from 'vitest';

import { TenantDeletionUnitOfWork } from './tenant-deletion.unit-of-work.js';

/**
 * Builds a tenant runner that records the options of each run and runs the work.
 *
 * @returns The runner and the options of its runs.
 */
function recordingRunner(): {
  readonly runner: TenantTransactionRunner;
  readonly runs: (TransactionOptions | undefined)[];
} {
  const runs: (TransactionOptions | undefined)[] = [];
  return {
    runner: {
      run: <TResult>(
        work: (scope: unknown) => Promise<TResult>,
        options?: TransactionOptions,
      ): Promise<TResult> => {
        runs.push(options);
        return work({});
      },
    } as unknown as TenantTransactionRunner,
    runs,
  };
}

describe('TenantDeletionUnitOfWork: one tenant transaction per run', () => {
  it('runs the work in one read-write tenant transaction of the context and resolves with it', async () => {
    const { runner, runs } = recordingRunner();

    const result = await new TenantDeletionUnitOfWork(runner).run(() => Promise.resolve(7));

    expect(result).toBe(7);
    expect(runs).toEqual([undefined]);
  });

  it('rejects with the failure of the work, so the runner rolls the transaction back', async () => {
    const { runner } = recordingRunner();
    const failure = new Error('lock timeout');

    await expect(
      new TenantDeletionUnitOfWork(runner).run(() => Promise.reject(failure)),
    ).rejects.toBe(failure);
  });
});
