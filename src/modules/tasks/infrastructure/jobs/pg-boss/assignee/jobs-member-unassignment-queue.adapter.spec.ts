import type { TransactionScope } from '@cadenway/nest-common/database';
import type { JobEnqueueOptions, JobProducer, JobsTransaction } from '@cadenway/nest-jobs/runtime';
import { describe, expect, it } from 'vitest';

import { JobsMemberUnassignmentQueue } from './jobs-member-unassignment-queue.adapter.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Account of Hugo Dubois (HD), who left Atelier Nord. */
const HUGO: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** Membership of Hugo Dubois in Atelier Nord. */
const HUGO_MEMBERSHIP: string = '019a6b10-0000-7000-8000-000000000003';

/** What the producer received. */
interface Enqueued {
  // #region Properties
  /** The transaction the job was inserted through. */
  readonly tx: JobsTransaction;

  /** The queue. */
  readonly queue: string;

  /** The payload. */
  readonly payload: unknown;

  /** The options, with the occurrence key. */
  readonly options: JobEnqueueOptions | undefined;
  // #endregion
}

/**
 * Builds a producer that records each enqueue and answers whether it was a duplicate.
 *
 * @param duplicate - The answer of the kit.
 * @returns The producer and its records.
 */
function recordingProducer(duplicate: boolean): {
  readonly producer: JobProducer;
  readonly enqueued: Enqueued[];
} {
  const enqueued: Enqueued[] = [];
  return {
    producer: {
      enqueue: (tx, queue, payload, options) => {
        enqueued.push({ tx, queue, payload, options });
        return Promise.resolve({ jobId: '019a8000-0000-8000-8000-000000000001', duplicate });
      },
    },
    enqueued,
  };
}

/** The tenant transaction of Atelier Nord, as the runner of the kit gives it. */
const transaction = {
  db: {},
  client: { query: () => Promise.resolve({ rows: [] }) },
  kind: 'tenant',
  organizationId: ATELIER_NORD,
} as unknown as TransactionScope;

describe('JobsMemberUnassignmentQueue: one job per removal, in the transaction of the removal', () => {
  it('enqueues through the transaction with the account as payload and the membership and version as occurrence', async () => {
    const { producer, enqueued } = recordingProducer(false);

    const scheduled = await new JobsMemberUnassignmentQueue(transaction, producer).enqueue(
      ATELIER_NORD,
      HUGO,
      HUGO_MEMBERSHIP,
      3,
    );

    expect(scheduled).toBe(true);
    expect(enqueued).toEqual([
      {
        tx: transaction,
        queue: 'task.unassign-removed-member',
        payload: { userId: HUGO },
        options: { occurrenceKey: `${HUGO_MEMBERSHIP}:3` },
      },
    ]);
  });

  it('answers false when the kit found the occurrence already enqueued', async () => {
    const { producer } = recordingProducer(true);

    await expect(
      new JobsMemberUnassignmentQueue(transaction, producer).enqueue(
        ATELIER_NORD,
        HUGO,
        HUGO_MEMBERSHIP,
        3,
      ),
    ).resolves.toBe(false);
  });

  it('refuses an organization other than the one of the transaction, and enqueues nothing', async () => {
    const { producer, enqueued } = recordingProducer(false);

    await expect(
      new JobsMemberUnassignmentQueue(transaction, producer).enqueue(
        '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b99',
        HUGO,
        HUGO_MEMBERSHIP,
        3,
      ),
    ).rejects.toThrow('The unassignment job names another organization than its transaction.');
    expect(enqueued).toEqual([]);
  });
});
