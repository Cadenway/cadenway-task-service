import { describe, expect, it } from 'vitest';

import type { RequestDropTarget } from '../../../../models/access-request/request-drop-target.model.js';
import { DeletionStepError } from '../../../../models/deletion/deletion-step-error.model.js';
import type { TargetAccessRequests } from '../../../../ports/outbound/access-requests/access-request/target-access-requests.port.js';
import type { UntrashedTasks } from '../../../../ports/outbound/tasks/trash/untrashed-tasks.port.js';
import type { DeletionUnitOfWork } from '../../../../ports/outbound/transactions/deletion/deletion-unit-of-work.port.js';
import { DropTrashedTaskRequests } from './drop-trashed-task-requests.use-case.js';

/** Organization "Atelier Nord", as the job carries it. */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** CAD-482, the root of the entry. */
const CAD_482: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1482';

/** CAD-483, a subtask of CAD-482 in the entry. */
const CAD_483: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1483';

/** What the ports answer. */
interface Answers {
  // #region Properties
  /** The tasks found out of the trash, or the error of the read. */
  readonly untrashed?: readonly string[] | Error;

  /** The requests dropped, or the error of the dropping. */
  readonly dropped?: number | Error;
  // #endregion
}

/**
 * Wires the use case on a unit of work that records its runs and ports that answer `answers`.
 *
 * @param answers - What the ports answer.
 * @returns The use case, the calls with the run they ran in, and the runs.
 */
function wire(answers: Answers): {
  readonly useCase: DropTrashedTaskRequests;
  readonly calls: {
    readonly run: number;
    readonly call: string;
    readonly target?: RequestDropTarget;
  }[];
  readonly runs: ('committed' | 'rolled-back')[];
} {
  const calls: {
    readonly run: number;
    readonly call: string;
    readonly target?: RequestDropTarget;
  }[] = [];
  const runs: ('committed' | 'rolled-back')[] = [];
  const answer = <TValue>(value: TValue | Error): Promise<TValue> =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  const unitOfWork: DeletionUnitOfWork = {
    run: async <TResult>(work: () => Promise<TResult>): Promise<TResult> => {
      runs.push('committed');
      try {
        return await work();
      } catch (error: unknown) {
        runs[runs.length - 1] = 'rolled-back';
        throw error;
      }
    },
  };
  const tasks: UntrashedTasks = {
    untrashedOf: (organizationId: string, taskIds: readonly string[]) => {
      expect(organizationId).toBe(ATELIER_NORD);
      calls.push({ run: runs.length, call: `untrashed:${taskIds.join(',')}` });
      return answer(answers.untrashed ?? []);
    },
  };
  const requests: TargetAccessRequests = {
    dropPending: (organizationId: string, target: RequestDropTarget) => {
      expect(organizationId).toBe(ATELIER_NORD);
      calls.push({ run: runs.length, call: 'drop', target });
      return answer(answers.dropped ?? 0);
    },
  };
  return { useCase: new DropTrashedTaskRequests(unitOfWork, tasks, requests), calls, runs };
}

describe('DropTrashedTaskRequests: the pending requests of the tasks of a trash entry', () => {
  it('drops the requests of every task still in the trash, in one transaction after the read', async () => {
    const { useCase, calls, runs } = wire({ untrashed: [], dropped: 2 });

    const output = await useCase.execute({
      organizationId: ATELIER_NORD,
      taskIds: [CAD_482, CAD_483],
    });

    expect(output).toEqual({ dropped: 2, untrashed: 0 });
    expect(calls).toEqual([
      { run: 1, call: `untrashed:${CAD_482},${CAD_483}` },
      { run: 1, call: 'drop', target: { kind: 'tasks', taskIds: [CAD_482, CAD_483] } },
    ]);
    expect(runs).toEqual(['committed']);
  });

  it('keeps the requests of a task restored from the trash before the job ran', async () => {
    const { useCase, calls } = wire({ untrashed: [CAD_482], dropped: 1 });

    const output = await useCase.execute({
      organizationId: ATELIER_NORD,
      taskIds: [CAD_482, CAD_483],
    });

    expect(output).toEqual({ dropped: 1, untrashed: 1 });
    expect(calls.at(1)?.target).toEqual({ kind: 'tasks', taskIds: [CAD_483] });
  });

  it('drops nothing for an entry restored whole', async () => {
    const { useCase, calls } = wire({ untrashed: [CAD_483, CAD_482] });

    const output = await useCase.execute({
      organizationId: ATELIER_NORD,
      taskIds: [CAD_482, CAD_483],
    });

    expect(output).toEqual({ dropped: 0, untrashed: 2 });
    expect(calls.filter((entry) => entry.call === 'drop')).toEqual([]);
  });

  it('reads and drops an entry of more than 2,000 tasks in one call each, in one transaction', async () => {
    const taskIds = Array.from(
      { length: 2_001 },
      (_, index) => `019a7002-3c4d-7e5f-8a6b-${String(index).padStart(12, '0')}`,
    );
    const { useCase, calls, runs } = wire({ dropped: 1 });

    const output = await useCase.execute({ organizationId: ATELIER_NORD, taskIds });

    expect(output).toEqual({ dropped: 1, untrashed: 0 });
    expect(
      calls.map((entry) =>
        entry.call === 'drop' && entry.target?.kind === 'tasks'
          ? `drop:${String(entry.target.taskIds.length)}`
          : `read:${String(entry.call.split(',').length)}`,
      ),
    ).toEqual(['read:2001', 'drop:2001']);
    expect(runs).toEqual(['committed']);
  });

  it('answers 0 once the requests are gone, so a job run again is harmless', async () => {
    const { useCase } = wire({ dropped: 0 });

    await expect(
      useCase.execute({ organizationId: ATELIER_NORD, taskIds: [CAD_482] }),
    ).resolves.toEqual({ dropped: 0, untrashed: 0 });
  });

  it('rejects with a step error of the step requests when the dropping fails, and the transaction rolls back', async () => {
    const failure = new Error('canceling statement due to lock timeout');
    const { useCase, runs } = wire({ dropped: failure });

    const rejection: unknown = await useCase
      .execute({ organizationId: ATELIER_NORD, taskIds: [CAD_482] })
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(DeletionStepError);
    expect(rejection).toMatchObject({
      step: 'requests',
      batches: 0,
      cause: failure,
      message:
        'requests batch failed after 0 committed batches: canceling statement due to lock timeout',
    });
    expect(runs).toEqual(['rolled-back']);
  });

  it('rejects with a step error when the read of the tasks fails, and drops nothing', async () => {
    const failure = new Error('statement timeout');
    const { useCase, calls } = wire({ untrashed: failure });

    await expect(
      useCase.execute({ organizationId: ATELIER_NORD, taskIds: [CAD_482] }),
    ).rejects.toThrow(expect.objectContaining({ step: 'requests', cause: failure }) as Error);
    expect(calls.filter((entry) => entry.call === 'drop')).toEqual([]);
  });
});
