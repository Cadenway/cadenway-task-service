import { describe, expect, it } from 'vitest';

import type { RequestDropTarget } from '../../../../models/access-request/request-drop-target.model.js';
import type { DeletedListBatch } from '../../../../models/deletion/deleted-list-batch.model.js';
import type { DeletedSpaceListing } from '../../../../models/deletion/deleted-space-listing.model.js';
import type { DeletedSpacePurge } from '../../../../models/deletion/deleted-space-purge.model.js';
import { DeletionStepError } from '../../../../models/deletion/deletion-step-error.model.js';
import type { RootPosition } from '../../../../models/deletion/root-position.model.js';
import type { TargetAccessRequests } from '../../../../ports/outbound/access-requests/access-request/target-access-requests.port.js';
import type { DeletedSpaceLists } from '../../../../ports/outbound/spaces/list/deleted-space-lists.port.js';
import type { DeletedSpaceEraser } from '../../../../ports/outbound/spaces/space/deleted-space-eraser.port.js';
import type { DeletedListTasks } from '../../../../ports/outbound/tasks/trash/deleted-list-tasks.port.js';
import type { DeletionUnitOfWork } from '../../../../ports/outbound/transactions/deletion/deletion-unit-of-work.port.js';
import type { MoveDeletedTasksToTrashInput } from './move-deleted-tasks-to-trash.input.js';
import { MoveDeletedTasksToTrash } from './move-deleted-tasks-to-trash.use-case.js';

/** Organization "Atelier Nord", as the job carries it. */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The space "Produit", deleted. */
const PRODUIT: string = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';

/** The list "Sprint 14" of "Produit", deleted. */
const SPRINT_14: string = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f14';

/** The list "Roadmap" of "Produit", deleted with it. */
const ROADMAP: string = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f40';

/** CAD-482, a top-level task of "Sprint 14". */
const CAD_482: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1482';

/** CAD-483, a subtask of CAD-482. */
const CAD_483: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1483';

/** CAD-490, another top-level task of "Sprint 14". */
const CAD_490: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1490';

/** The position of CAD-482 in "Sprint 14". */
const AFTER_482: RootPosition = { createdAt: new Date('2026-10-01T08:00:00.000Z'), id: CAD_482 };

/** The position of CAD-490 in "Sprint 14". */
const AFTER_490: RootPosition = { createdAt: new Date('2026-10-02T08:00:00.000Z'), id: CAD_490 };

/** The deletion of "Sprint 14". */
const listInput: MoveDeletedTasksToTrashInput = {
  organizationId: ATELIER_NORD,
  target: { kind: 'list', listId: SPRINT_14 },
};

/** The deletion of "Produit". */
const spaceInput: MoveDeletedTasksToTrashInput = {
  organizationId: ATELIER_NORD,
  target: { kind: 'space', spaceId: PRODUIT },
};

/** A batch that found nothing left and erased nothing. */
const NONE_LEFT: DeletedListBatch = { outcome: 'none-left', listPurged: false, spacePurged: false };

/** The scripted answers of the ports. */
interface Scripts {
  // #region Properties
  /** The answers of the dropping of the requests, in order, then 0. */
  readonly requests?: readonly (number | Error)[];

  /** What the reading of the space answers, or the error of the read. */
  readonly lists?: DeletedSpaceListing | Error;

  /** The answers of the batches of each list, in order, then `none-left`. */
  readonly batches?: Readonly<Record<string, readonly (DeletedListBatch | Error)[]>>;

  /** The answer of the erasure of the space. */
  readonly space?: DeletedSpacePurge | Error;
  // #endregion
}

/** Ports that answer from scripts and record what they were asked, in order. */
interface Scripted {
  // #region Properties
  /** The calls, each with the number of the transaction it ran in. */
  readonly calls: string[];

  /** The outcome of each transaction, in order. */
  readonly transactions: ('committed' | 'rolled-back')[];

  /** The use case wired on the ports. */
  readonly useCase: MoveDeletedTasksToTrash;
  // #endregion
}

/**
 * Describes a target of the dropping of requests, for the calls.
 *
 * @param target - The target.
 * @returns Its description.
 */
function describeTarget(target: RequestDropTarget): string {
  switch (target.kind) {
    case 'tasks':
      return `tasks[${target.taskIds.join(',')}]`;
    case 'list':
      return `list ${target.listId}`;
    case 'space':
      return `space ${target.spaceId}`;
  }
}

/**
 * Wires the use case on scripted ports. Each run of the unit of work is a numbered transaction,
 * and each call records the transaction it ran in.
 *
 * @param scripts - The answers of the ports.
 * @param onCall - Run at each call, with its description, before it answers.
 * @returns The calls, the transactions and the use case.
 */
function scripted(scripts: Scripts, onCall: (call: string) => void = () => undefined): Scripted {
  const calls: string[] = [];
  const transactions: ('committed' | 'rolled-back')[] = [];
  const requestAnswers = [...(scripts.requests ?? [])];
  const batchAnswers = new Map<string, (DeletedListBatch | Error)[]>(
    Object.entries(scripts.batches ?? {}).map(([listId, answers]) => [listId, [...answers]]),
  );
  let current: number = 0;
  const record = (call: string): void => {
    calls.push(`${String(current)}:${call}`);
    onCall(call);
  };
  const answer = <TValue>(value: TValue | Error): Promise<TValue> =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  const unitOfWork: DeletionUnitOfWork = {
    run: async <TResult>(work: () => Promise<TResult>): Promise<TResult> => {
      transactions.push('committed');
      current = transactions.length;
      const index: number = current - 1;
      try {
        return await work();
      } catch (error: unknown) {
        transactions[index] = 'rolled-back';
        throw error;
      } finally {
        current = 0;
      }
    },
  };
  const requests: TargetAccessRequests = {
    dropPending: (organizationId: string, target: RequestDropTarget) => {
      record(`requests ${organizationId} ${describeTarget(target)}`);
      return answer(requestAnswers.shift() ?? 0);
    },
  };
  const lists: DeletedSpaceLists = {
    deletedListsOf: (organizationId: string, spaceId: string) => {
      record(`lists ${organizationId} ${spaceId}`);
      return answer(scripts.lists ?? { space: 'deleted', listIds: [] });
    },
  };
  const tasks: DeletedListTasks = {
    trashBatch: (organizationId: string, listId: string, after: RootPosition | null) => {
      record(`tasks ${organizationId} ${listId} after ${after?.id ?? 'first'}`);
      return answer(batchAnswers.get(listId)?.shift() ?? NONE_LEFT);
    },
  };
  const spaces: DeletedSpaceEraser = {
    erase: (organizationId: string, spaceId: string) => {
      record(`space ${organizationId} ${spaceId}`);
      return answer(scripts.space ?? 'not-empty');
    },
  };
  return {
    calls,
    transactions,
    useCase: new MoveDeletedTasksToTrash(unitOfWork, requests, lists, tasks, spaces),
  };
}

/**
 * The kind of each call, in order.
 *
 * @param calls - The calls.
 * @returns Their kinds.
 */
function kindsOf(calls: readonly string[]): string[] {
  return calls.map((call) => call.split(' ')[0]?.split(':')[1] ?? '');
}

describe('MoveDeletedTasksToTrash: a deleted list, batch after batch, with its requests', () => {
  it('moves the roots of the list from the first to the last, the requests of the list in the first batch and those of the tasks in each', async () => {
    const { calls, transactions, useCase } = scripted({
      requests: [2, 3, 1],
      batches: {
        [SPRINT_14]: [
          { outcome: 'trashed', entries: 1, taskIds: [CAD_482, CAD_483], last: AFTER_482 },
          { outcome: 'trashed', entries: 1, taskIds: [CAD_490], last: AFTER_490 },
          { outcome: 'none-left', listPurged: false, spacePurged: false },
        ],
      },
    });

    const output = await useCase.execute(listInput);

    expect(output).toEqual({
      outcome: 'completed',
      entries: 2,
      tasks: 3,
      requestsDropped: 6,
      listsPurged: 0,
      spacePurged: false,
      batches: 2,
    });
    expect(calls).toEqual([
      `1:tasks ${ATELIER_NORD} ${SPRINT_14} after first`,
      `1:requests ${ATELIER_NORD} list ${SPRINT_14}`,
      `1:requests ${ATELIER_NORD} tasks[${CAD_482},${CAD_483}]`,
      `2:tasks ${ATELIER_NORD} ${SPRINT_14} after ${CAD_482}`,
      `2:requests ${ATELIER_NORD} tasks[${CAD_490}]`,
      `3:tasks ${ATELIER_NORD} ${SPRINT_14} after ${CAD_490}`,
    ]);
    expect(transactions).toEqual(['committed', 'committed', 'committed']);
  });

  it('drops the requests of a list left without a task in the batch that saw it deleted, and counts its erased tombstone', async () => {
    const { calls, useCase } = scripted({
      requests: [4],
      batches: { [SPRINT_14]: [{ outcome: 'none-left', listPurged: true, spacePurged: false }] },
    });

    const output = await useCase.execute(listInput);

    expect(output).toMatchObject({
      outcome: 'completed',
      requestsDropped: 4,
      listsPurged: 1,
      batches: 0,
    });
    expect(calls).toEqual([
      `1:tasks ${ATELIER_NORD} ${SPRINT_14} after first`,
      `1:requests ${ATELIER_NORD} list ${SPRINT_14}`,
    ]);
  });

  it('keeps the requests of a list a restoration brought back before its first batch, and writes nothing', async () => {
    const { calls, useCase } = scripted({ batches: { [SPRINT_14]: [{ outcome: 'list-live' }] } });

    const output = await useCase.execute(listInput);

    expect(output).toMatchObject({ outcome: 'list-live', requestsDropped: 0, entries: 0 });
    expect(kindsOf(calls)).toEqual(['tasks']);
  });

  it('stops on a list a restoration brought back after a batch, and says so', async () => {
    const { calls, useCase } = scripted({
      batches: {
        [SPRINT_14]: [
          { outcome: 'trashed', entries: 1, taskIds: [CAD_482], last: AFTER_482 },
          { outcome: 'list-live' },
        ],
      },
    });

    const output = await useCase.execute(listInput);

    expect(output).toMatchObject({ outcome: 'list-live', entries: 1, batches: 1 });
    expect(kindsOf(calls)).toEqual(['tasks', 'requests', 'requests', 'tasks']);
  });

  it('goes on after a batch that moved nothing, and stops only on none-left', async () => {
    const { calls, useCase } = scripted({
      batches: {
        [SPRINT_14]: [
          { outcome: 'trashed', entries: 0, taskIds: [], last: AFTER_482 },
          { outcome: 'trashed', entries: 1, taskIds: [CAD_490], last: AFTER_490 },
        ],
      },
    });

    const output = await useCase.execute(listInput);

    expect(output).toMatchObject({ entries: 1, tasks: 1, batches: 2 });
    expect(kindsOf(calls)).toEqual(['tasks', 'requests', 'tasks', 'requests', 'tasks']);
  });

  it('drops the requests of every task of a batch in one call, in the transaction of the batch', async () => {
    const taskIds = Array.from(
      { length: 2_001 },
      (_, index) => `019a7002-3c4d-7e5f-8a6b-${String(index).padStart(12, '0')}`,
    );
    const { calls, transactions, useCase } = scripted({
      batches: { [SPRINT_14]: [{ outcome: 'trashed', entries: 1, taskIds, last: AFTER_482 }] },
    });

    const output = await useCase.execute(listInput);

    expect(output).toMatchObject({ entries: 1, tasks: 2_001 });
    const drops = calls.filter((call) => call.startsWith('1:requests') && call.includes('tasks['));
    expect(drops.map((call) => call.split(',').length)).toEqual([2_001]);
    expect(transactions).toEqual(['committed', 'committed']);
  });

  it('finds nothing to do when nothing is left, so a job run again is harmless', async () => {
    const { calls, useCase } = scripted({});

    const output = await useCase.execute(listInput);

    expect(output).toEqual({
      outcome: 'completed',
      entries: 0,
      tasks: 0,
      requestsDropped: 0,
      listsPurged: 0,
      spacePurged: false,
      batches: 0,
    });
    expect(kindsOf(calls)).toEqual(['tasks', 'requests']);
  });
});

describe('MoveDeletedTasksToTrash: an erased list and a rescan', () => {
  it('drops the requests of a list erased before its job ran, and ends the list', async () => {
    const { calls, useCase } = scripted({
      requests: [2],
      batches: { [SPRINT_14]: [{ outcome: 'list-gone' }] },
    });

    const output = await useCase.execute(listInput);

    expect(output).toMatchObject({ outcome: 'completed', requestsDropped: 2, batches: 0 });
    expect(calls).toEqual([
      `1:tasks ${ATELIER_NORD} ${SPRINT_14} after first`,
      `1:requests ${ATELIER_NORD} list ${SPRINT_14}`,
    ]);
  });

  it('starts the list again from its first root on a rescan, writing and dropping nothing for it', async () => {
    const { calls, useCase } = scripted({
      batches: {
        [SPRINT_14]: [
          { outcome: 'trashed', entries: 1, taskIds: [CAD_482], last: AFTER_490 },
          { outcome: 'rescan' },
          { outcome: 'trashed', entries: 1, taskIds: [CAD_490], last: AFTER_482 },
        ],
      },
    });

    const output = await useCase.execute(listInput);

    expect(output).toMatchObject({ outcome: 'completed', entries: 2, batches: 2 });
    expect(calls).toEqual([
      `1:tasks ${ATELIER_NORD} ${SPRINT_14} after first`,
      `1:requests ${ATELIER_NORD} list ${SPRINT_14}`,
      `1:requests ${ATELIER_NORD} tasks[${CAD_482}]`,
      `2:tasks ${ATELIER_NORD} ${SPRINT_14} after ${CAD_490}`,
      `3:tasks ${ATELIER_NORD} ${SPRINT_14} after first`,
      `3:requests ${ATELIER_NORD} tasks[${CAD_490}]`,
      `4:tasks ${ATELIER_NORD} ${SPRINT_14} after ${CAD_482}`,
    ]);
  });

  it('drops the requests of the list in its first batch after a rescan when none dropped them before', async () => {
    const { calls, useCase } = scripted({
      batches: {
        [SPRINT_14]: [
          { outcome: 'rescan' },
          { outcome: 'none-left', listPurged: false, spacePurged: false },
        ],
      },
    });

    await useCase.execute(listInput);

    expect(kindsOf(calls)).toEqual(['tasks', 'tasks', 'requests']);
  });

  it('rescans a list 3 times at most in an attempt, then fails it with a step error of the step tasks', async () => {
    const { calls, useCase } = scripted({
      batches: {
        [SPRINT_14]: [
          { outcome: 'rescan' },
          { outcome: 'rescan' },
          { outcome: 'rescan' },
          { outcome: 'rescan' },
        ],
      },
    });

    const rejection: unknown = await useCase.execute(listInput).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(DeletionStepError);
    expect(rejection).toMatchObject({
      step: 'tasks',
      batches: 0,
      message:
        'tasks batch failed after 0 committed batches: The deleted list still holds tasks out of the trash after 3 rescans.',
    });
    expect(kindsOf(calls)).toEqual(['tasks', 'tasks', 'tasks', 'tasks']);
  });

  it('counts the rescans of each list apart', async () => {
    const { useCase } = scripted({
      lists: { space: 'deleted', listIds: [SPRINT_14, ROADMAP] },
      batches: {
        [SPRINT_14]: [{ outcome: 'rescan' }, { outcome: 'rescan' }, { outcome: 'rescan' }],
        [ROADMAP]: [{ outcome: 'rescan' }, { outcome: 'rescan' }, { outcome: 'rescan' }],
      },
    });

    await expect(useCase.execute(spaceInput)).resolves.toMatchObject({ outcome: 'completed' });
  });
});

describe('MoveDeletedTasksToTrash: a deleted space, list after list, then the space', () => {
  it('drops the requests of a space erased before its job ran, and still erases nothing', async () => {
    const { calls, useCase } = scripted({
      requests: [3],
      lists: { space: 'gone', listIds: [] },
      space: 'not-found',
    });

    const output = await useCase.execute(spaceInput);

    expect(output).toMatchObject({ outcome: 'completed', requestsDropped: 3, spacePurged: false });
    expect(calls).toEqual([
      `1:lists ${ATELIER_NORD} ${PRODUIT}`,
      `1:requests ${ATELIER_NORD} space ${PRODUIT}`,
      `2:space ${ATELIER_NORD} ${PRODUIT}`,
    ]);
  });

  it('reads its lists and drops the requests of the space in one transaction, moves each list with its requests, then erases the space', async () => {
    const { calls, useCase } = scripted({
      requests: [4, 1, 2, 0, 3],
      lists: { space: 'deleted', listIds: [SPRINT_14, ROADMAP] },
      batches: {
        [SPRINT_14]: [{ outcome: 'trashed', entries: 1, taskIds: [CAD_482], last: AFTER_482 }],
        [ROADMAP]: [{ outcome: 'trashed', entries: 1, taskIds: [CAD_490], last: AFTER_490 }],
      },
      space: 'not-empty',
    });

    const output = await useCase.execute(spaceInput);

    expect(output).toEqual({
      outcome: 'completed',
      entries: 2,
      tasks: 2,
      requestsDropped: 10,
      listsPurged: 0,
      spacePurged: false,
      batches: 2,
    });
    expect(calls).toEqual([
      `1:lists ${ATELIER_NORD} ${PRODUIT}`,
      `1:requests ${ATELIER_NORD} space ${PRODUIT}`,
      `2:tasks ${ATELIER_NORD} ${SPRINT_14} after first`,
      `2:requests ${ATELIER_NORD} list ${SPRINT_14}`,
      `2:requests ${ATELIER_NORD} tasks[${CAD_482}]`,
      `3:tasks ${ATELIER_NORD} ${SPRINT_14} after ${CAD_482}`,
      `4:tasks ${ATELIER_NORD} ${ROADMAP} after first`,
      `4:requests ${ATELIER_NORD} list ${ROADMAP}`,
      `4:requests ${ATELIER_NORD} tasks[${CAD_490}]`,
      `5:tasks ${ATELIER_NORD} ${ROADMAP} after ${CAD_490}`,
      `6:space ${ATELIER_NORD} ${PRODUIT}`,
    ]);
  });

  it('keeps the requests of a space a restoration brought back, and still moves its lists that stay deleted', async () => {
    const { calls, useCase } = scripted({
      lists: { space: 'live', listIds: [ROADMAP] },
      batches: {
        [ROADMAP]: [{ outcome: 'trashed', entries: 1, taskIds: [CAD_490], last: AFTER_490 }],
      },
      space: 'not-deleted',
    });

    const output = await useCase.execute(spaceInput);

    expect(output).toMatchObject({ outcome: 'completed', entries: 1, spacePurged: false });
    expect(calls).toEqual([
      `1:lists ${ATELIER_NORD} ${PRODUIT}`,
      `2:tasks ${ATELIER_NORD} ${ROADMAP} after first`,
      `2:requests ${ATELIER_NORD} list ${ROADMAP}`,
      `2:requests ${ATELIER_NORD} tasks[${CAD_490}]`,
      `3:tasks ${ATELIER_NORD} ${ROADMAP} after ${CAD_490}`,
      `4:space ${ATELIER_NORD} ${PRODUIT}`,
    ]);
  });

  it('erases a deleted space that holds no deleted list', async () => {
    const { calls, useCase } = scripted({
      lists: { space: 'deleted', listIds: [] },
      space: 'purged',
    });

    const output = await useCase.execute(spaceInput);

    expect(output).toMatchObject({ outcome: 'completed', spacePurged: true, batches: 0 });
    expect(kindsOf(calls)).toEqual(['lists', 'requests', 'space']);
  });

  it('asks for no erasure of the space once its last list erased it', async () => {
    const { calls, useCase } = scripted({
      lists: { space: 'deleted', listIds: [SPRINT_14] },
      batches: { [SPRINT_14]: [{ outcome: 'none-left', listPurged: true, spacePurged: true }] },
    });

    const output = await useCase.execute(spaceInput);

    expect(output).toMatchObject({ listsPurged: 1, spacePurged: true });
    expect(kindsOf(calls)).toEqual(['lists', 'requests', 'tasks', 'requests']);
  });

  it('goes on with the other lists after one a restoration brought back', async () => {
    const { calls, useCase } = scripted({
      lists: { space: 'deleted', listIds: [SPRINT_14, ROADMAP] },
      batches: {
        [SPRINT_14]: [{ outcome: 'list-live' }],
        [ROADMAP]: [{ outcome: 'trashed', entries: 1, taskIds: [CAD_490], last: AFTER_490 }],
      },
      space: 'not-deleted',
    });

    const output = await useCase.execute(spaceInput);

    expect(output).toMatchObject({ outcome: 'list-live', entries: 1, spacePurged: false });
    expect(kindsOf(calls)).toEqual([
      'lists',
      'requests',
      'tasks',
      'tasks',
      'requests',
      'requests',
      'tasks',
      'space',
    ]);
  });
});

describe('MoveDeletedTasksToTrash: a failed step fails the attempt, says where, and the next one resumes', () => {
  it('rolls back a batch whose requests could not be dropped, with its tasks, and names the step tasks', async () => {
    const failure = new Error('canceling statement due to lock timeout');
    const { transactions, useCase } = scripted({
      requests: [0, 1, failure],
      batches: {
        [SPRINT_14]: [
          { outcome: 'trashed', entries: 1, taskIds: [CAD_482], last: AFTER_482 },
          { outcome: 'trashed', entries: 1, taskIds: [CAD_490], last: AFTER_490 },
        ],
      },
    });

    const rejection: unknown = await useCase.execute(listInput).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(DeletionStepError);
    expect(rejection).toMatchObject({
      step: 'tasks',
      batches: 1,
      cause: failure,
      message:
        'tasks batch failed after 1 committed batches: canceling statement due to lock timeout',
    });
    expect(transactions).toEqual(['committed', 'rolled-back']);
  });

  it('drops the requests of the list again in the next attempt when the batch that dropped them rolled back', async () => {
    const { calls, useCase } = scripted({
      requests: [new Error('lock timeout')],
      batches: {
        [SPRINT_14]: [{ outcome: 'trashed', entries: 1, taskIds: [CAD_482], last: AFTER_482 }],
      },
    });
    await expect(useCase.execute(listInput)).rejects.toThrow(DeletionStepError);

    await useCase.execute(listInput);

    expect(calls.filter((call) => call.includes(`list ${SPRINT_14}`))).toHaveLength(2);
  });

  it('names the step lists when the space cannot be read, or its requests cannot be dropped', async () => {
    const unreadable = scripted({ lists: new Error('statement timeout') });
    const undroppable = scripted({ requests: [new Error('lock timeout')] });

    await expect(unreadable.useCase.execute(spaceInput)).rejects.toThrow(
      expect.objectContaining({ step: 'lists', batches: 0 }) as DeletionStepError,
    );
    await expect(undroppable.useCase.execute(spaceInput)).rejects.toThrow(
      expect.objectContaining({ step: 'lists', batches: 0 }) as DeletionStepError,
    );
    expect(undroppable.transactions).toEqual(['rolled-back']);
  });

  it('names the step space with the batches before it when the space cannot be erased', async () => {
    const { useCase } = scripted({
      lists: { space: 'deleted', listIds: [SPRINT_14] },
      batches: {
        [SPRINT_14]: [{ outcome: 'trashed', entries: 1, taskIds: [CAD_482], last: AFTER_482 }],
      },
      space: new Error('lock timeout'),
    });

    await expect(useCase.execute(spaceInput)).rejects.toThrow(
      'space batch failed after 1 committed batches: lock timeout',
    );
  });

  it('starts a list of a new attempt again from its first root', async () => {
    const { calls, useCase } = scripted({
      batches: {
        [SPRINT_14]: [
          { outcome: 'trashed', entries: 1, taskIds: [CAD_482], last: AFTER_482 },
          new Error('statement timeout'),
        ],
      },
    });
    await expect(useCase.execute(listInput)).rejects.toThrow(DeletionStepError);

    await useCase.execute(listInput);

    expect(calls.filter((call) => call.includes(':tasks ')).at(2)).toBe(
      `3:tasks ${ATELIER_NORD} ${SPRINT_14} after first`,
    );
  });

  it('keeps the reason of an aborted signal as it is', async () => {
    const attempt = new AbortController();
    const reason = new Error('The attempt expired.');
    attempt.abort(reason);
    const { useCase } = scripted({});

    const rejection: unknown = await useCase
      .execute({ ...listInput, signal: attempt.signal })
      .catch((error: unknown) => error);

    expect(rejection).toBe(reason);
  });
});

describe('MoveDeletedTasksToTrash: no step starts once the signal of the attempt aborted', () => {
  it('rejects with the reason before the first step of an attempt already aborted', async () => {
    const attempt = new AbortController();
    attempt.abort(new Error('The attempt expired.'));
    const { calls, useCase } = scripted({});

    await expect(useCase.execute({ ...spaceInput, signal: attempt.signal })).rejects.toThrow(
      'The attempt expired.',
    );
    expect(calls).toEqual([]);
  });

  it('keeps the batches committed before the abort and starts no other, nor the erasure of the space', async () => {
    const attempt = new AbortController();
    const { calls, useCase } = scripted(
      {
        lists: { space: 'deleted', listIds: [SPRINT_14, ROADMAP] },
        batches: {
          [SPRINT_14]: [{ outcome: 'trashed', entries: 1, taskIds: [CAD_482], last: AFTER_482 }],
        },
      },
      (call) => {
        if (call.startsWith('tasks')) {
          attempt.abort(new Error('The attempt expired.'));
        }
      },
    );

    await expect(useCase.execute({ ...spaceInput, signal: attempt.signal })).rejects.toThrow(
      'The attempt expired.',
    );
    expect(kindsOf(calls)).toEqual(['lists', 'requests', 'tasks', 'requests', 'requests']);
  });
});
