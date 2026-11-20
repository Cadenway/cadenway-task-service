import type { SystemTransactionRunner, TransactionScope } from '@cadenway/nest-common/database';
import type { JobProducer, JobsTransaction } from '@cadenway/nest-jobs/runtime';
import { describe, expect, it } from 'vitest';

import { SystemTrashPurgeScheduleUnitOfWork } from './system-trash-purge-schedule.unit-of-work.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Another organization with trash to erase. */
const OTHER_ORGANIZATION: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b99';

/**
 * Builds a system runner that runs each work in a fake transaction of its own, numbered.
 *
 * @returns The runner and the clients of its runs.
 */
function recordingRunner(): {
  readonly runner: SystemTransactionRunner;
  readonly clients: TransactionScope['client'][];
} {
  const clients: TransactionScope['client'][] = [];
  return {
    runner: {
      run: <TResult>(work: (scope: TransactionScope) => Promise<TResult>): Promise<TResult> => {
        const client: TransactionScope['client'] = {
          query: () => Promise.resolve({ rows: [] }),
        };
        clients.push(client);
        return work({
          db: {},
          client,
          kind: 'system',
          organizationId: null,
        } as unknown as TransactionScope);
      },
    } as unknown as SystemTransactionRunner,
    clients,
  };
}

describe('SystemTrashPurgeScheduleUnitOfWork: one system transaction per page of the schedule', () => {
  it('binds the purge queue of the store to the client of its system transaction', async () => {
    const { runner, clients } = recordingRunner();
    const transactions: JobsTransaction[] = [];
    const producer: JobProducer = {
      enqueue: (tx) => {
        transactions.push(tx);
        return Promise.resolve({ jobId: '019a8000-0000-8000-8000-000000000061', duplicate: false });
      },
    };

    const added = await new SystemTrashPurgeScheduleUnitOfWork(runner, producer).run(
      async (store) => {
        await store.purges.enqueue(ATELIER_NORD, 'scheduled:1');
        await store.purges.enqueue(OTHER_ORGANIZATION, 'scheduled:1');
        return 2;
      },
    );

    expect(added).toBe(2);
    expect(clients).toHaveLength(1);
    expect(transactions).toEqual([
      { client: clients[0], organizationId: ATELIER_NORD },
      { client: clients[0], organizationId: OTHER_ORGANIZATION },
    ]);
  });

  it('rejects with the failure of the work, so the runner rolls the transaction back', async () => {
    const { runner } = recordingRunner();
    const failure = new Error('canceling statement due to statement timeout');
    const producer: JobProducer = { enqueue: () => Promise.reject(failure) };

    await expect(
      new SystemTrashPurgeScheduleUnitOfWork(runner, producer).run((store) =>
        store.purges.enqueue(ATELIER_NORD, 'scheduled:1'),
      ),
    ).rejects.toBe(failure);
  });
});
