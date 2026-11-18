import { describe, expect, it } from 'vitest';

import type { SpaceHandoverBatch } from '../../../../models/clean-up/space-handover-batch.model.js';
import type { TaskUnassignmentBatch } from '../../../../models/clean-up/task-unassignment-batch.model.js';
import type { PrivateSpaceHandover } from '../../../../ports/outbound/spaces/space/private-space-handover.port.js';
import type { TaskAssignments } from '../../../../ports/outbound/tasks/assignee/task-assignments.port.js';
import { CleanUpRemovedMember } from './clean-up-removed-member.use-case.js';

/** Organization "Atelier Nord", as the job carries it. */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Account of Hugo Dubois (HD), who left Atelier Nord. */
const HUGO: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** The clean-up of Hugo Dubois. */
const input = { organizationId: ATELIER_NORD, userId: HUGO } as const;

/** Ports that answer from scripted batches and record what they were asked, in order. */
interface Scripted {
  // #region Properties
  /** The calls, in order. */
  readonly calls: string[];

  /** The use case wired on the ports. */
  readonly useCase: CleanUpRemovedMember;
  // #endregion
}

/**
 * Wires the use case on scripted ports: each call takes the next answer, then `none-left`. An
 * `Error` in a script is thrown by that call.
 *
 * @param spaceBatches - The answers of the handover of the spaces.
 * @param taskBatches - The answers of the unassignment from the tasks.
 * @param onCall - Run at each call, with its name, before it answers.
 * @returns The calls and the use case.
 */
function scripted(
  spaceBatches: readonly (SpaceHandoverBatch | Error)[],
  taskBatches: readonly (TaskUnassignmentBatch | Error)[],
  onCall: (call: string) => void = () => undefined,
): Scripted {
  const calls: string[] = [];
  const spaceAnswers = [...spaceBatches];
  const taskAnswers = [...taskBatches];
  const next = <TBatch>(answers: (TBatch | Error)[], fallback: TBatch): Promise<TBatch> => {
    const answer: TBatch | Error = answers.shift() ?? fallback;
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  const spaces: PrivateSpaceHandover = {
    handOverBatch: (organizationId: string, formerOwnerUserId: string) => {
      const call = `spaces:${organizationId}:${formerOwnerUserId}`;
      calls.push(call);
      onCall(call);
      return next<SpaceHandoverBatch>(spaceAnswers, { outcome: 'none-left' });
    },
    handOverAwaiting: () => Promise.reject(new Error('Not part of the clean-up.')),
  };
  const assignments: TaskAssignments = {
    unassignBatch: (organizationId: string, userId: string, afterTaskId: string | null) => {
      const call = `tasks:${organizationId}:${userId}:${afterTaskId ?? 'first'}`;
      calls.push(call);
      onCall(call);
      return next<TaskUnassignmentBatch>(taskAnswers, { outcome: 'none-left' });
    },
  };
  return { calls, useCase: new CleanUpRemovedMember(spaces, assignments) };
}

describe('CleanUpRemovedMember: the private spaces first, then the tasks, batch after batch', () => {
  it('hands the spaces over until a batch finds none, then unassigns the tasks after the last id of each batch until one finds none', async () => {
    const { calls, useCase } = scripted(
      [
        { outcome: 'handed-over', handedOver: 100, awaitingOwner: 0 },
        { outcome: 'handed-over', handedOver: 20, awaitingOwner: 0 },
      ],
      [
        { outcome: 'unassigned', unassigned: 500, lastTaskId: 'task-500' },
        { outcome: 'unassigned', unassigned: 200, lastTaskId: 'task-700' },
      ],
    );

    const output = await useCase.execute(input);

    expect(output).toEqual({
      outcome: 'completed',
      spacesHandedOver: 120,
      spacesAwaitingOwner: 0,
      tasksUnassigned: 700,
      batches: 4,
    });
    expect(calls).toEqual([
      `spaces:${ATELIER_NORD}:${HUGO}`,
      `spaces:${ATELIER_NORD}:${HUGO}`,
      `spaces:${ATELIER_NORD}:${HUGO}`,
      `tasks:${ATELIER_NORD}:${HUGO}:first`,
      `tasks:${ATELIER_NORD}:${HUGO}:task-500`,
      `tasks:${ATELIER_NORD}:${HUGO}:task-700`,
    ]);
  });

  it('goes on after a short batch, and stops only on an empty one', async () => {
    const { calls, useCase } = scripted(
      [{ outcome: 'handed-over', handedOver: 3, awaitingOwner: 0 }],
      [
        { outcome: 'unassigned', unassigned: 0, lastTaskId: 'task-1' },
        { outcome: 'unassigned', unassigned: 2, lastTaskId: 'task-3' },
      ],
    );

    const output = await useCase.execute(input);

    expect(output.outcome).toBe('completed');
    expect(calls.filter((call) => call.startsWith('spaces'))).toHaveLength(2);
    expect(calls.filter((call) => call.startsWith('tasks'))).toHaveLength(3);
  });

  it('counts the spaces left awaiting an owner while the copy holds none', async () => {
    const { useCase } = scripted([{ outcome: 'handed-over', handedOver: 0, awaitingOwner: 2 }], []);

    const output = await useCase.execute(input);

    expect(output).toEqual({
      outcome: 'completed',
      spacesHandedOver: 0,
      spacesAwaitingOwner: 2,
      tasksUnassigned: 0,
      batches: 1,
    });
  });

  it('finds nothing to do when nothing is left, so a job run again is harmless', async () => {
    const { calls, useCase } = scripted([], []);

    const output = await useCase.execute(input);

    expect(output).toEqual({
      outcome: 'completed',
      spacesHandedOver: 0,
      spacesAwaitingOwner: 0,
      tasksUnassigned: 0,
      batches: 0,
    });
    expect(calls).toEqual([
      `spaces:${ATELIER_NORD}:${HUGO}`,
      `tasks:${ATELIER_NORD}:${HUGO}:first`,
    ]);
  });
});

describe('CleanUpRemovedMember: the job stops for good once the person is a member again', () => {
  it('touches no task when a space batch finds the account a member again', async () => {
    const { calls, useCase } = scripted(
      [{ outcome: 'handed-over', handedOver: 100, awaitingOwner: 0 }, { outcome: 'member-again' }],
      [{ outcome: 'unassigned', unassigned: 1, lastTaskId: 'task-1' }],
    );

    const output = await useCase.execute(input);

    expect(output).toEqual({
      outcome: 'member-again',
      spacesHandedOver: 100,
      spacesAwaitingOwner: 0,
      tasksUnassigned: 0,
      batches: 1,
    });
    expect(calls.some((call) => call.startsWith('tasks'))).toBe(false);
  });

  it('keeps the task batches committed before a re-join and asks for no more', async () => {
    const { calls, useCase } = scripted(
      [],
      [
        { outcome: 'unassigned', unassigned: 500, lastTaskId: 'task-500' },
        { outcome: 'member-again' },
      ],
    );

    const output = await useCase.execute(input);

    expect(output).toMatchObject({ outcome: 'member-again', tasksUnassigned: 500, batches: 1 });
    expect(calls.filter((call) => call.startsWith('tasks'))).toHaveLength(2);
  });
});

describe('CleanUpRemovedMember: a failed batch fails the attempt, and the next one resumes', () => {
  it('rejects with the error of the batch and asks for nothing after it', async () => {
    const failure = new Error('lock timeout');
    const { calls, useCase } = scripted(
      [{ outcome: 'handed-over', handedOver: 100, awaitingOwner: 0 }, failure],
      [],
    );

    await expect(useCase.execute(input)).rejects.toThrow(failure);
    expect(calls).toHaveLength(2);
  });

  it('starts the tasks of a new attempt again from the first batch', async () => {
    const failure = new Error('statement timeout');
    const { calls, useCase } = scripted(
      [],
      [{ outcome: 'unassigned', unassigned: 500, lastTaskId: 'task-500' }, failure],
    );
    await expect(useCase.execute(input)).rejects.toThrow(failure);

    await useCase.execute(input);

    expect(calls.filter((call) => call.startsWith('tasks')).at(2)).toBe(
      `tasks:${ATELIER_NORD}:${HUGO}:first`,
    );
  });
});

describe('CleanUpRemovedMember: no batch starts once the signal of the attempt aborted', () => {
  it('rejects with the reason before the first batch of an attempt already aborted', async () => {
    const attempt = new AbortController();
    attempt.abort(new Error('The attempt expired.'));
    const { calls, useCase } = scripted([], []);

    await expect(useCase.execute({ ...input, signal: attempt.signal })).rejects.toThrow(
      'The attempt expired.',
    );
    expect(calls).toEqual([]);
  });

  it('keeps the batches committed before the abort and starts no other, spaces or tasks', async () => {
    const attempt = new AbortController();
    const { calls, useCase } = scripted(
      [{ outcome: 'handed-over', handedOver: 100, awaitingOwner: 0 }],
      [{ outcome: 'unassigned', unassigned: 500, lastTaskId: 'task-500' }],
      (call) => {
        if (call.startsWith('tasks')) {
          attempt.abort(new Error('The attempt expired.'));
        }
      },
    );

    await expect(useCase.execute({ ...input, signal: attempt.signal })).rejects.toThrow(
      'The attempt expired.',
    );
    expect(calls).toEqual([
      `spaces:${ATELIER_NORD}:${HUGO}`,
      `spaces:${ATELIER_NORD}:${HUGO}`,
      `tasks:${ATELIER_NORD}:${HUGO}:first`,
    ]);
  });
});
