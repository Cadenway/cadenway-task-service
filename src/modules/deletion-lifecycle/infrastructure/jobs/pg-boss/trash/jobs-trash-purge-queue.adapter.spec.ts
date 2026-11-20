import type { TransactionScope } from '@cadenway/nest-common/database';
import type { JobEnqueueOptions, JobProducer, JobsTransaction } from '@cadenway/nest-jobs/runtime';
import { propagation } from '@opentelemetry/api';
import type { TextMapPropagator, TextMapSetter } from '@opentelemetry/api';
import { afterEach, describe, expect, it } from 'vitest';

import { JobsTrashPurgeQueue } from './jobs-trash-purge-queue.adapter.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The occurrence of the schedule of 19 November 2026. */
const OCCURRENCE: string = 'scheduled:019a9000-0000-7000-8000-000000000003';

/** A W3C `traceparent` of the occurrence of the schedule. */
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

/** The client of the system transaction. */
const systemClient: TransactionScope['client'] = { query: () => Promise.resolve({ rows: [] }) };

/** The system transaction of a run of the unit of work, as the runner of the kit gives it. */
const systemTransaction: TransactionScope = {
  db: {},
  client: systemClient,
  kind: 'system',
  organizationId: null,
} as unknown as TransactionScope;

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
        return Promise.resolve({ jobId: '019a8000-0000-8000-8000-000000000051', duplicate });
      },
    },
    enqueued,
  };
}

/** A propagator that writes a fixed `traceparent`, as the W3C propagator does for an active span. */
const fixedPropagator: TextMapPropagator = {
  inject: (_context, carrier, setter: TextMapSetter): void => {
    setter.set(carrier, 'traceparent', TRACEPARENT);
  },
  extract: (context) => context,
  fields: () => ['traceparent'],
};

describe('JobsTrashPurgeQueue: the purge of an organization, through the system transaction', () => {
  afterEach(() => {
    propagation.disable();
  });

  it('enqueues through the client of the system transaction, in the envelope of the organization, under the occurrence', async () => {
    const { producer, enqueued } = recordingProducer(false);

    const added = await new JobsTrashPurgeQueue(systemTransaction, producer).enqueue(
      ATELIER_NORD,
      OCCURRENCE,
    );

    expect(added).toBe(true);
    expect(enqueued).toEqual([
      {
        tx: { client: systemClient, organizationId: ATELIER_NORD },
        queue: 'task.purge-trash',
        payload: {},
        options: { occurrenceKey: OCCURRENCE },
      },
    ]);
  });

  it('answers false when the kit found the organization already enqueued under the occurrence', async () => {
    const { producer } = recordingProducer(true);

    await expect(
      new JobsTrashPurgeQueue(systemTransaction, producer).enqueue(ATELIER_NORD, OCCURRENCE),
    ).resolves.toBe(false);
  });

  it('stores the traceparent of the active trace in the payload', async () => {
    propagation.setGlobalPropagator(fixedPropagator);
    const { producer, enqueued } = recordingProducer(false);

    await new JobsTrashPurgeQueue(systemTransaction, producer).enqueue(ATELIER_NORD, OCCURRENCE);

    expect(enqueued[0]?.payload).toEqual({ traceparent: TRACEPARENT });
  });

  it('rejects with the failure of the insert, which aborts the transaction', async () => {
    const failure = new Error('canceling statement due to statement timeout');
    const producer: JobProducer = { enqueue: () => Promise.reject(failure) };

    await expect(
      new JobsTrashPurgeQueue(systemTransaction, producer).enqueue(ATELIER_NORD, OCCURRENCE),
    ).rejects.toBe(failure);
  });
});
