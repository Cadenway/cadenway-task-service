import type { TransactionScope } from '@cadenway/nest-common/database';
import type { JobEnqueueOptions, JobProducer, JobsTransaction } from '@cadenway/nest-jobs/runtime';
import { propagation } from '@opentelemetry/api';
import type { TextMapPropagator, TextMapSetter } from '@opentelemetry/api';
import { afterEach, describe, expect, it } from 'vitest';

import { JobsRemovedMemberCleanUpQueue } from './jobs-removed-member-clean-up-queue.adapter.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Account of Hugo Dubois (HD), who left Atelier Nord. */
const HUGO: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** Membership of Hugo Dubois in Atelier Nord. */
const HUGO_MEMBERSHIP: string = '019a6b10-0000-7000-8000-000000000003';

/** A W3C `traceparent` of the delivery of the removal. */
const TRACEPARENT: string = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

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

/**
 * The tenant transaction of an organization, as the runner of the kit gives it.
 *
 * @param organizationId - The organization of the context, as it was spelled.
 * @returns The transaction.
 */
function transactionOf(organizationId: string): TransactionScope {
  return {
    db: {},
    client: { query: () => Promise.resolve({ rows: [] }) },
    kind: 'tenant',
    organizationId,
  } as unknown as TransactionScope;
}

/** A propagator that writes a fixed `traceparent`, as the W3C propagator does for an active span. */
const fixedPropagator: TextMapPropagator = {
  inject: (_context, carrier, setter: TextMapSetter): void => {
    setter.set(carrier, 'traceparent', TRACEPARENT);
  },
  extract: (context) => context,
  fields: () => ['traceparent'],
};

describe('JobsRemovedMemberCleanUpQueue: one job per removal, in the transaction of the removal', () => {
  afterEach(() => {
    propagation.disable();
  });

  it('enqueues through the transaction with the account as payload and the membership and version as occurrence', async () => {
    const transaction = transactionOf(ATELIER_NORD);
    const { producer, enqueued } = recordingProducer(false);

    const scheduled = await new JobsRemovedMemberCleanUpQueue(transaction, producer).enqueue(
      HUGO,
      HUGO_MEMBERSHIP,
      3,
    );

    expect(scheduled).toBe(true);
    expect(enqueued).toEqual([
      {
        tx: transaction,
        queue: 'task.clean-up-removed-member',
        payload: { userId: HUGO },
        options: { occurrenceKey: `${HUGO_MEMBERSHIP}:3` },
      },
    ]);
  });

  it('answers false when the kit found the occurrence already enqueued', async () => {
    const { producer } = recordingProducer(true);

    await expect(
      new JobsRemovedMemberCleanUpQueue(transactionOf(ATELIER_NORD), producer).enqueue(
        HUGO,
        HUGO_MEMBERSHIP,
        3,
      ),
    ).resolves.toBe(false);
  });

  it('enqueues in a transaction whose organization is spelled in upper case, as the envelope of the event spelled it', async () => {
    const transaction = transactionOf(ATELIER_NORD.toUpperCase());
    const { producer, enqueued } = recordingProducer(false);

    await expect(
      new JobsRemovedMemberCleanUpQueue(transaction, producer).enqueue(HUGO, HUGO_MEMBERSHIP, 3),
    ).resolves.toBe(true);
    expect(enqueued.map((job) => job.tx)).toEqual([transaction]);
  });

  it('stores the traceparent of the active trace with the account', async () => {
    propagation.setGlobalPropagator(fixedPropagator);
    const { producer, enqueued } = recordingProducer(false);

    await new JobsRemovedMemberCleanUpQueue(transactionOf(ATELIER_NORD), producer).enqueue(
      HUGO,
      HUGO_MEMBERSHIP,
      3,
    );

    expect(enqueued[0]?.payload).toEqual({ userId: HUGO, traceparent: TRACEPARENT });
  });
});
