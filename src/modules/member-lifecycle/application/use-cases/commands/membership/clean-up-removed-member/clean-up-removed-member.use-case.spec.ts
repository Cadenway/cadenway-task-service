import { describe, expect, it } from 'vitest';

import type { GrantRemovalBatch } from '../../../../models/clean-up/grant-removal-batch.model.js';
import type { RequestDropBatch } from '../../../../models/clean-up/request-drop-batch.model.js';
import type { SpaceHandoverBatch } from '../../../../models/clean-up/space-handover-batch.model.js';
import type { TaskUnassignmentBatch } from '../../../../models/clean-up/task-unassignment-batch.model.js';
import type { MemberAccessRequests } from '../../../../ports/outbound/access-requests/access-request/member-access-requests.port.js';
import type { MemberGrants } from '../../../../ports/outbound/spaces/access/member-grants.port.js';
import type { PrivateSpaceHandover } from '../../../../ports/outbound/spaces/space/private-space-handover.port.js';
import type { TaskAssignments } from '../../../../ports/outbound/tasks/assignee/task-assignments.port.js';
import { CleanUpRemovedMember } from './clean-up-removed-member.use-case.js';

/** Organization "Atelier Nord", as the job carries it. */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Account of Hugo Dubois (HD), who left Atelier Nord. */
const HUGO: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** The clean-up of Hugo Dubois. */
const input = { organizationId: ATELIER_NORD, userId: HUGO } as const;

/** What a run finds when nothing is left. */
const NOTHING = {
  spacesHandedOver: 0,
  spacesAwaitingOwner: 0,
  grantsRemoved: 0,
  requestsDropped: 0,
  tasksUnassigned: 0,
  batches: 0,
} as const;

/** The scripted answers of the four steps. */
interface Scripts {
  // #region Properties
  /** The answers of the handover of the spaces. */
  readonly spaces?: readonly (SpaceHandoverBatch | Error)[];

  /** The answers of the removal of the grants. */
  readonly grants?: readonly (GrantRemovalBatch | Error)[];

  /** The answers of the dropping of the access requests. */
  readonly requests?: readonly (RequestDropBatch | Error)[];

  /** The answers of the unassignment from the tasks. */
  readonly tasks?: readonly (TaskUnassignmentBatch | Error)[];
  // #endregion
}

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
 * @param scripts - The answers of each step.
 * @param onCall - Run at each call, with its name, before it answers.
 * @returns The calls and the use case.
 */
function scripted(scripts: Scripts, onCall: (call: string) => void = () => undefined): Scripted {
  const calls: string[] = [];
  const spaceAnswers = [...(scripts.spaces ?? [])];
  const grantAnswers = [...(scripts.grants ?? [])];
  const requestAnswers = [...(scripts.requests ?? [])];
  const taskAnswers = [...(scripts.tasks ?? [])];
  const next = <TBatch>(answers: (TBatch | Error)[], fallback: TBatch): Promise<TBatch> => {
    const answer: TBatch | Error = answers.shift() ?? fallback;
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  const record = (call: string): void => {
    calls.push(call);
    onCall(call);
  };
  const spaces: PrivateSpaceHandover = {
    handOverBatch: (organizationId: string, formerOwnerUserId: string) => {
      record(`spaces:${organizationId}:${formerOwnerUserId}`);
      return next<SpaceHandoverBatch>(spaceAnswers, { outcome: 'none-left' });
    },
    handOverAwaiting: () => Promise.reject(new Error('Not part of the clean-up.')),
  };
  const grants: MemberGrants = {
    removeBatch: (organizationId: string, userId: string) => {
      record(`grants:${organizationId}:${userId}`);
      return next<GrantRemovalBatch>(grantAnswers, { outcome: 'none-left' });
    },
  };
  const requests: MemberAccessRequests = {
    dropBatch: (organizationId: string, userId: string) => {
      record(`requests:${organizationId}:${userId}`);
      return next<RequestDropBatch>(requestAnswers, { outcome: 'none-left' });
    },
  };
  const assignments: TaskAssignments = {
    unassignBatch: (organizationId: string, userId: string, afterTaskId: string | null) => {
      record(`tasks:${organizationId}:${userId}:${afterTaskId ?? 'first'}`);
      return next<TaskUnassignmentBatch>(taskAnswers, { outcome: 'none-left' });
    },
  };
  return { calls, useCase: new CleanUpRemovedMember(spaces, grants, requests, assignments) };
}

/**
 * The step of each call, in order.
 *
 * @param calls - The calls.
 * @returns Their steps.
 */
function stepsOf(calls: readonly string[]): string[] {
  return calls.map((call) => call.split(':')[0] ?? '');
}

describe('CleanUpRemovedMember: spaces, then grants, then access requests, then tasks, batch after batch', () => {
  it('runs every step until a batch finds none, then the tasks after the last id of each batch', async () => {
    const { calls, useCase } = scripted({
      spaces: [
        { outcome: 'handed-over', handedOver: 100, awaitingOwner: 0 },
        { outcome: 'handed-over', handedOver: 20, awaitingOwner: 0 },
      ],
      grants: [
        { outcome: 'removed', removed: 100 },
        { outcome: 'removed', removed: 3 },
      ],
      requests: [{ outcome: 'dropped', dropped: 7 }],
      tasks: [
        { outcome: 'unassigned', unassigned: 500, lastTaskId: 'task-500' },
        { outcome: 'unassigned', unassigned: 200, lastTaskId: 'task-700' },
      ],
    });

    const output = await useCase.execute(input);

    expect(output).toEqual({
      outcome: 'completed',
      spacesHandedOver: 120,
      spacesAwaitingOwner: 0,
      grantsRemoved: 103,
      requestsDropped: 7,
      tasksUnassigned: 700,
      batches: 7,
    });
    expect(calls).toEqual([
      `spaces:${ATELIER_NORD}:${HUGO}`,
      `spaces:${ATELIER_NORD}:${HUGO}`,
      `spaces:${ATELIER_NORD}:${HUGO}`,
      `grants:${ATELIER_NORD}:${HUGO}`,
      `grants:${ATELIER_NORD}:${HUGO}`,
      `grants:${ATELIER_NORD}:${HUGO}`,
      `requests:${ATELIER_NORD}:${HUGO}`,
      `requests:${ATELIER_NORD}:${HUGO}`,
      `tasks:${ATELIER_NORD}:${HUGO}:first`,
      `tasks:${ATELIER_NORD}:${HUGO}:task-500`,
      `tasks:${ATELIER_NORD}:${HUGO}:task-700`,
    ]);
  });

  it('removes the grants after the handover of the spaces and before the access requests and the tasks', async () => {
    const { calls, useCase } = scripted({
      spaces: [{ outcome: 'handed-over', handedOver: 1, awaitingOwner: 0 }],
      grants: [{ outcome: 'removed', removed: 1 }],
      requests: [{ outcome: 'dropped', dropped: 1 }],
      tasks: [{ outcome: 'unassigned', unassigned: 1, lastTaskId: 'task-1' }],
    });

    await useCase.execute(input);

    expect([...new Set(stepsOf(calls))]).toEqual(['spaces', 'grants', 'requests', 'tasks']);
  });

  it('goes on after a short batch, and stops only on an empty one', async () => {
    const { calls, useCase } = scripted({
      spaces: [{ outcome: 'handed-over', handedOver: 3, awaitingOwner: 0 }],
      grants: [
        { outcome: 'removed', removed: 0 },
        { outcome: 'removed', removed: 2 },
      ],
      requests: [{ outcome: 'dropped', dropped: 0 }],
      tasks: [
        { outcome: 'unassigned', unassigned: 0, lastTaskId: 'task-1' },
        { outcome: 'unassigned', unassigned: 2, lastTaskId: 'task-3' },
      ],
    });

    const output = await useCase.execute(input);

    expect(output.outcome).toBe('completed');
    expect(stepsOf(calls)).toEqual([
      'spaces',
      'spaces',
      'grants',
      'grants',
      'grants',
      'requests',
      'requests',
      'tasks',
      'tasks',
      'tasks',
    ]);
  });

  it('counts the spaces left awaiting an owner while the copy holds none', async () => {
    const { useCase } = scripted({
      spaces: [{ outcome: 'handed-over', handedOver: 0, awaitingOwner: 2 }],
    });

    const output = await useCase.execute(input);

    expect(output).toEqual({
      ...NOTHING,
      outcome: 'completed',
      spacesAwaitingOwner: 2,
      batches: 1,
    });
  });

  it('finds nothing to do when nothing is left, so a job run again is harmless', async () => {
    const { calls, useCase } = scripted({});

    const output = await useCase.execute(input);

    expect(output).toEqual({ ...NOTHING, outcome: 'completed' });
    expect(calls).toEqual([
      `spaces:${ATELIER_NORD}:${HUGO}`,
      `grants:${ATELIER_NORD}:${HUGO}`,
      `requests:${ATELIER_NORD}:${HUGO}`,
      `tasks:${ATELIER_NORD}:${HUGO}:first`,
    ]);
  });
});

describe('CleanUpRemovedMember: the job stops for good once the person is a member again', () => {
  it('touches no grant, request or task when a space batch finds the account a member again', async () => {
    const { calls, useCase } = scripted({
      spaces: [
        { outcome: 'handed-over', handedOver: 100, awaitingOwner: 0 },
        { outcome: 'member-again' },
      ],
      grants: [{ outcome: 'removed', removed: 1 }],
      tasks: [{ outcome: 'unassigned', unassigned: 1, lastTaskId: 'task-1' }],
    });

    const output = await useCase.execute(input);

    expect(output).toEqual({
      ...NOTHING,
      outcome: 'member-again',
      spacesHandedOver: 100,
      batches: 1,
    });
    expect(stepsOf(calls)).toEqual(['spaces', 'spaces']);
  });

  it('stops at a grant batch that finds the account a member again, before the requests and tasks', async () => {
    const { calls, useCase } = scripted({
      grants: [{ outcome: 'removed', removed: 100 }, { outcome: 'member-again' }],
      requests: [{ outcome: 'dropped', dropped: 1 }],
    });

    const output = await useCase.execute(input);

    expect(output).toEqual({
      ...NOTHING,
      outcome: 'member-again',
      grantsRemoved: 100,
      batches: 1,
    });
    expect(stepsOf(calls)).toEqual(['spaces', 'grants', 'grants']);
  });

  it('stops at a request batch that finds the account a member again, before the tasks', async () => {
    const { calls, useCase } = scripted({
      requests: [{ outcome: 'dropped', dropped: 500 }, { outcome: 'member-again' }],
      tasks: [{ outcome: 'unassigned', unassigned: 1, lastTaskId: 'task-1' }],
    });

    const output = await useCase.execute(input);

    expect(output).toEqual({
      ...NOTHING,
      outcome: 'member-again',
      requestsDropped: 500,
      batches: 1,
    });
    expect(stepsOf(calls)).toEqual(['spaces', 'grants', 'requests', 'requests']);
  });

  it('keeps the task batches committed before a re-join and asks for no more', async () => {
    const { calls, useCase } = scripted({
      tasks: [
        { outcome: 'unassigned', unassigned: 500, lastTaskId: 'task-500' },
        { outcome: 'member-again' },
      ],
    });

    const output = await useCase.execute(input);

    expect(output).toMatchObject({ outcome: 'member-again', tasksUnassigned: 500, batches: 1 });
    expect(calls.filter((call) => call.startsWith('tasks'))).toHaveLength(2);
  });
});

describe('CleanUpRemovedMember: a failed batch fails the attempt, and the next one resumes', () => {
  it('rejects with the error of the batch and asks for nothing after it', async () => {
    const failure = new Error('lock timeout');
    const { calls, useCase } = scripted({
      spaces: [{ outcome: 'handed-over', handedOver: 100, awaitingOwner: 0 }, failure],
    });

    await expect(useCase.execute(input)).rejects.toThrow(failure);
    expect(calls).toHaveLength(2);
  });

  it('rejects with the error of a grant batch and drops no request', async () => {
    const failure = new Error('statement timeout');
    const { calls, useCase } = scripted({ grants: [failure] });

    await expect(useCase.execute(input)).rejects.toThrow(failure);
    expect(stepsOf(calls)).toEqual(['spaces', 'grants']);
  });

  it('rejects with the error of a request batch and unassigns no task', async () => {
    const failure = new Error('statement timeout');
    const { calls, useCase } = scripted({ requests: [failure] });

    await expect(useCase.execute(input)).rejects.toThrow(failure);
    expect(stepsOf(calls)).toEqual(['spaces', 'grants', 'requests']);
  });

  it('starts the tasks of a new attempt again from the first batch', async () => {
    const failure = new Error('statement timeout');
    const { calls, useCase } = scripted({
      tasks: [{ outcome: 'unassigned', unassigned: 500, lastTaskId: 'task-500' }, failure],
    });
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
    const { calls, useCase } = scripted({});

    await expect(useCase.execute({ ...input, signal: attempt.signal })).rejects.toThrow(
      'The attempt expired.',
    );
    expect(calls).toEqual([]);
  });

  it('keeps the batches committed before the abort and starts no other, of any step', async () => {
    const attempt = new AbortController();
    const { calls, useCase } = scripted(
      {
        spaces: [{ outcome: 'handed-over', handedOver: 100, awaitingOwner: 0 }],
        grants: [{ outcome: 'removed', removed: 100 }],
        tasks: [{ outcome: 'unassigned', unassigned: 500, lastTaskId: 'task-500' }],
      },
      (call) => {
        if (call.startsWith('grants')) {
          attempt.abort(new Error('The attempt expired.'));
        }
      },
    );

    await expect(useCase.execute({ ...input, signal: attempt.signal })).rejects.toThrow(
      'The attempt expired.',
    );
    expect(stepsOf(calls)).toEqual(['spaces', 'spaces', 'grants']);
  });
});
