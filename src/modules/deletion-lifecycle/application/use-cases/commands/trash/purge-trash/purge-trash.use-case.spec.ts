import { describe, expect, it } from 'vitest';

import { DeletionStepError } from '../../../../models/deletion/deletion-step-error.model.js';
import type { TrashPurgeBatch } from '../../../../models/trash/trash-purge-batch.model.js';
import type { TrashPurge } from '../../../../ports/outbound/tasks/trash/trash-purge.port.js';
import { PurgeTrash } from './purge-trash.use-case.js';

/** Organization "Atelier Nord", as the job carries it. */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/**
 * Wires the use case on a port that answers the scripted batches, then `none-left`, and counts its
 * calls.
 *
 * @param answers - The answers, in order; an `Error` is thrown by that call.
 * @param onCall - Run at each call, before it answers.
 * @returns The use case and the organizations asked for.
 */
function wire(
  answers: readonly (TrashPurgeBatch | Error)[],
  onCall: () => void = () => undefined,
): { readonly useCase: PurgeTrash; readonly calls: string[] } {
  const calls: string[] = [];
  const left = [...answers];
  const trash: TrashPurge = {
    purgeBatch: (organizationId: string) => {
      calls.push(organizationId);
      onCall();
      const answer: TrashPurgeBatch | Error = left.shift() ?? { outcome: 'none-left' };
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
  return { useCase: new PurgeTrash(trash), calls };
}

describe('PurgeTrash: the trash of an organization, batch after batch', () => {
  it('erases until a batch finds nothing left, and adds up what each batch erased', async () => {
    const { useCase, calls } = wire([
      { outcome: 'purged', entries: 20, tasks: 520, listsPurged: 0, spacesPurged: 0 },
      { outcome: 'purged', entries: 3, tasks: 9, listsPurged: 2, spacesPurged: 1 },
    ]);

    const output = await useCase.execute({ organizationId: ATELIER_NORD });

    expect(output).toEqual({
      entries: 23,
      tasks: 529,
      listsPurged: 2,
      spacesPurged: 1,
      batches: 2,
    });
    expect(calls).toEqual([ATELIER_NORD, ATELIER_NORD, ATELIER_NORD]);
  });

  it('goes on after a batch that erased only tombstones, and stops only on none-left', async () => {
    const { useCase, calls } = wire([
      { outcome: 'purged', entries: 0, tasks: 0, listsPurged: 1, spacesPurged: 0 },
    ]);

    const output = await useCase.execute({ organizationId: ATELIER_NORD });

    expect(output).toMatchObject({ entries: 0, listsPurged: 1, batches: 1 });
    expect(calls).toHaveLength(2);
  });

  it('finds nothing to do when nothing is due, so a job run again is harmless', async () => {
    const { useCase, calls } = wire([]);

    const output = await useCase.execute({ organizationId: ATELIER_NORD });

    expect(output).toEqual({ entries: 0, tasks: 0, listsPurged: 0, spacesPurged: 0, batches: 0 });
    expect(calls).toHaveLength(1);
  });
});

describe('PurgeTrash: a failed batch fails the attempt and says where', () => {
  it('rejects with the step purge, the batches committed before it and the cause', async () => {
    const failure = new Error('canceling statement due to lock timeout');
    const { useCase, calls } = wire([
      { outcome: 'purged', entries: 20, tasks: 500, listsPurged: 0, spacesPurged: 0 },
      failure,
    ]);

    const rejection: unknown = await useCase
      .execute({ organizationId: ATELIER_NORD })
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(DeletionStepError);
    expect(rejection).toMatchObject({
      step: 'purge',
      batches: 1,
      cause: failure,
      message:
        'purge batch failed after 1 committed batches: canceling statement due to lock timeout',
    });
    expect(calls).toHaveLength(2);
  });

  it('starts no batch once the signal of the attempt aborted, and keeps the batches before', async () => {
    const attempt = new AbortController();
    const { useCase, calls } = wire(
      [
        { outcome: 'purged', entries: 20, tasks: 500, listsPurged: 0, spacesPurged: 0 },
        { outcome: 'purged', entries: 20, tasks: 500, listsPurged: 0, spacesPurged: 0 },
      ],
      () => {
        attempt.abort(new Error('The attempt expired.'));
      },
    );

    await expect(
      useCase.execute({ organizationId: ATELIER_NORD, signal: attempt.signal }),
    ).rejects.toThrow('The attempt expired.');
    expect(calls).toHaveLength(1);
  });

  it('rejects with the reason before the first batch of an attempt already aborted', async () => {
    const attempt = new AbortController();
    const reason = new Error('The attempt expired.');
    attempt.abort(reason);
    const { useCase, calls } = wire([]);

    const rejection: unknown = await useCase
      .execute({ organizationId: ATELIER_NORD, signal: attempt.signal })
      .catch((error: unknown) => error);

    expect(rejection).toBe(reason);
    expect(calls).toEqual([]);
  });
});
