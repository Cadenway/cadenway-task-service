import type { TransactionScope } from '@cadenway/nest-common/database';
import type { JobEnqueueOptions, JobProducer, JobsTransaction } from '@cadenway/nest-jobs/runtime';
import { propagation } from '@opentelemetry/api';
import type { TextMapPropagator, TextMapSetter } from '@opentelemetry/api';
import { afterEach, describe, expect, it } from 'vitest';

import { JobsTrashDeletedTasksQueue } from './jobs-trash-deleted-tasks-queue.adapter.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The list "Bugs" of the space "Produit". */
const BUGS: string = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f13';

/** The space "Marketing". */
const MARKETING: string = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03';

/** A W3C `traceparent` of the deletion. */
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
        return Promise.resolve({ jobId: '019a8000-0000-8000-8000-000000000002', duplicate });
      },
    },
    enqueued,
  };
}

/**
 * The tenant transaction of an organization, as the runner of the kit gives it.
 *
 * @returns The transaction.
 */
function transactionOfAtelierNord(): TransactionScope {
  return {
    db: {},
    client: { query: () => Promise.resolve({ rows: [] }) },
    kind: 'tenant',
    organizationId: ATELIER_NORD,
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

describe('JobsTrashDeletedTasksQueue: one job per deletion, in the transaction of the deletion', () => {
  afterEach(() => {
    propagation.disable();
  });

  it('enqueues the deletion of a list with the list as payload and the list and its version as occurrence', async () => {
    const transaction = transactionOfAtelierNord();
    const { producer, enqueued } = recordingProducer(false);

    const scheduled = await new JobsTrashDeletedTasksQueue(transaction, producer).enqueue({
      kind: 'list',
      listId: BUGS,
      version: 3,
    });

    expect(scheduled).toBe(true);
    expect(enqueued).toEqual([
      {
        tx: transaction,
        queue: 'task.trash-deleted-tasks',
        payload: { listId: BUGS },
        options: { occurrenceKey: `list:${BUGS}:3` },
      },
    ]);
  });

  it('enqueues the deletion of a space with the space as payload and the space and its version as occurrence', async () => {
    const { producer, enqueued } = recordingProducer(false);

    await new JobsTrashDeletedTasksQueue(transactionOfAtelierNord(), producer).enqueue({
      kind: 'space',
      spaceId: MARKETING,
      version: 6,
    });

    expect(enqueued.map((job) => [job.payload, job.options])).toEqual([
      [{ spaceId: MARKETING }, { occurrenceKey: `space:${MARKETING}:6` }],
    ]);
  });

  it('answers false when the kit found the occurrence already enqueued', async () => {
    const { producer } = recordingProducer(true);

    await expect(
      new JobsTrashDeletedTasksQueue(transactionOfAtelierNord(), producer).enqueue({
        kind: 'list',
        listId: BUGS,
        version: 3,
      }),
    ).resolves.toBe(false);
  });

  it('stores the traceparent of the active trace with the target', async () => {
    propagation.setGlobalPropagator(fixedPropagator);
    const { producer, enqueued } = recordingProducer(false);

    await new JobsTrashDeletedTasksQueue(transactionOfAtelierNord(), producer).enqueue({
      kind: 'space',
      spaceId: MARKETING,
      version: 6,
    });

    expect(enqueued[0]?.payload).toEqual({ spaceId: MARKETING, traceparent: TRACEPARENT });
  });
});
