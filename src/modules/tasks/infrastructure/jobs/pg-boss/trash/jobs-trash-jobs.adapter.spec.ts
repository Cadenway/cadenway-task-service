import type { TransactionScope } from '@cadenway/nest-common/database';
import type { JobEnqueueOptions, JobProducer, JobsTransaction } from '@cadenway/nest-jobs/runtime';
import { propagation } from '@opentelemetry/api';
import type { TextMapPropagator, TextMapSetter } from '@opentelemetry/api';
import { afterEach, describe, expect, it } from 'vitest';

import { ATELIER_NORD, CAD_482, CAD_482_ENTRY, CAD_483 } from '../../../../domain/tasks.fixture.js';
import { JobsTrashJobs } from './jobs-trash-jobs.adapter.js';

/** A W3C `traceparent` of the request. */
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
 * Builds a producer that records each enqueue.
 *
 * @returns The producer and its records.
 */
function recordingProducer(): { readonly producer: JobProducer; readonly enqueued: Enqueued[] } {
  const enqueued: Enqueued[] = [];
  return {
    producer: {
      enqueue: (tx, queue, payload, options) => {
        enqueued.push({ tx, queue, payload, options });
        return Promise.resolve({ jobId: '019a8000-0000-8000-8000-000000000001', duplicate: false });
      },
    },
    enqueued,
  };
}

/** The tenant transaction of Atelier Nord, as the runner of the kit gives it. */
const transaction: TransactionScope = {
  db: {},
  client: { query: () => Promise.resolve({ rows: [] }) },
  kind: 'tenant',
  organizationId: ATELIER_NORD,
} as unknown as TransactionScope;

/** A propagator that writes a fixed `traceparent`, as the W3C propagator does for an active span. */
const fixedPropagator: TextMapPropagator = {
  inject: (_context, carrier, setter: TextMapSetter): void => {
    setter.set(carrier, 'traceparent', TRACEPARENT);
  },
  extract: (context) => context,
  fields: () => ['traceparent'],
};

describe('JobsTrashJobs: the jobs of the trash, in the transaction of the change', () => {
  afterEach(() => {
    propagation.disable();
  });

  it('enqueues the drop of the requests of an entry with its tasks, once per entry', async () => {
    const { producer, enqueued } = recordingProducer();

    await new JobsTrashJobs(transaction, producer).dropTrashedTaskRequests(CAD_482_ENTRY, [
      CAD_482,
      CAD_483,
    ]);

    expect(enqueued).toEqual([
      {
        tx: transaction,
        queue: 'task.drop-trashed-task-requests',
        payload: { taskIds: [CAD_482, CAD_483] },
        options: { occurrenceKey: `entry:${CAD_482_ENTRY}` },
      },
    ]);
  });

  it('enqueues one purge of the trash without occurrence key', async () => {
    const { producer, enqueued } = recordingProducer();

    await new JobsTrashJobs(transaction, producer).purgeTrash();

    expect(enqueued).toEqual([
      { tx: transaction, queue: 'task.purge-trash', payload: {}, options: undefined },
    ]);
  });

  it('stores the traceparent of the active trace in both payloads', async () => {
    propagation.setGlobalPropagator(fixedPropagator);
    const { producer, enqueued } = recordingProducer();
    const jobs = new JobsTrashJobs(transaction, producer);

    await jobs.dropTrashedTaskRequests(CAD_482_ENTRY, [CAD_482]);
    await jobs.purgeTrash();

    expect(enqueued.map((job) => job.payload)).toEqual([
      { taskIds: [CAD_482], traceparent: TRACEPARENT },
      { traceparent: TRACEPARENT },
    ]);
  });
});
