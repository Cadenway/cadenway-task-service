import { describe, expect, it } from 'vitest';

import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskField } from '../../../../../domain/value-objects/task/task-field.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import {
  ATELIER_NORD,
  CAD_482,
  CAD_490,
  CAMILLE,
  HUGO,
  InMemoryTasks,
  INES,
  NOW,
  OTHER_ORGANIZATION,
  atelierNordMembers,
  cad490State,
  taskState,
} from '../../../tasks.fixture.js';
import { UnassignRemovedMember } from './unassign-removed-member.use-case.js';

const system = { type: 'system', id: 'task-service' } as const;

/**
 * Builds a task of Atelier Nord assigned to Hugo Dubois; the ids follow the index, so the keyset
 * walks the tasks in index order.
 *
 * @param index - Which task; it gives the id and the key.
 * @param overrides - Fields to replace.
 * @returns The state.
 */
function assignedToHugo(index: number, overrides: Partial<TaskState> = {}): TaskState {
  return taskState({
    id: `019a7200-0000-7000-8000-${String(100_000 + index).padStart(12, '0')}`,
    key: TaskKey.of('CAD', 1000 + index),
    assigneeIds: [HUGO],
    version: 3,
    ...overrides,
  });
}

/**
 * Builds the tasks of Hugo Dubois, from index 0.
 *
 * @param count - How many.
 * @returns The states.
 */
function manyAssignedToHugo(count: number): TaskState[] {
  return Array.from({ length: count }, (_, index) => assignedToHugo(index));
}

/**
 * A copy of the memberships that answers from a list of answers, one per reading, the last one
 * repeated: what the copy would say while a re-join commits between two batches.
 *
 * @param answers - The role of Hugo Dubois at each reading.
 * @returns The directory and the number of readings.
 */
function changingCopy(answers: readonly (MemberRole | null)[]): {
  readonly members: MemberDirectory;
  readonly readings: () => number;
} {
  let readings = 0;
  return {
    members: {
      roleOf: (): Promise<MemberRole | null> => {
        const answer = answers[Math.min(readings, answers.length - 1)] ?? null;
        readings += 1;
        return Promise.resolve(answer);
      },
    },
    readings: () => readings,
  };
}

/**
 * Wraps the unit of work of the fake with a change of the store of each run.
 *
 * @param tasks - The fake.
 * @param change - What replaces parts of the store, given the run number from 1.
 * @returns A unit of work over the same rows.
 */
function wrapped(
  tasks: InMemoryTasks,
  change: (store: Parameters<Parameters<InMemoryTasks['run']>[0]>[0], run: number) => object,
): TasksUnitOfWork {
  let runs = 0;
  return {
    run: (work) => {
      runs += 1;
      const run = runs;
      return tasks.run((store) => work({ ...store, ...change(store, run) }));
    },
    runReadOnly: (work, options) => tasks.runReadOnly(work, options),
  };
}

describe('UnassignRemovedMember: a member who left is removed from every task they are assigned to', () => {
  it('removes the account from open and closed tasks and answers how many, in one batch', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        assignedToHugo(1),
        assignedToHugo(2, { status: 'done', completedAt: NOW }),
        assignedToHugo(3, { status: 'cancelled', cancelReason: 'scope' }),
        taskState({ assigneeIds: [CAMILLE, HUGO] }),
        cad490State({ assigneeIds: [CAMILLE] }),
      ],
    });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ outcome: 'completed', unassigned: 4, batches: 1 });
    expect([...tasks.tasks.values()].filter((row) => row.assigneeIds.includes(HUGO))).toEqual([]);
    expect(tasks.stored(CAD_482)).toMatchObject({
      assigneeIds: [CAMILLE],
      version: 13,
      updatedAt: NOW,
    });
    expect(tasks.stored(assignedToHugo(1).id)).toMatchObject({ assigneeIds: [], version: 4 });
    expect(tasks.stored(CAD_490).version).toBe(1);
  });

  it('records one assign entry with added false by the system actor per task', async () => {
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1), assignedToHugo(2)] });

    await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect([...tasks.activity.values()]).toEqual([
      expect.objectContaining({
        taskId: assignedToHugo(1).id,
        actor: system,
        occurredAt: NOW,
        change: { kind: 'assign', assignee: { userId: HUGO, added: false } },
      }),
      expect.objectContaining({ taskId: assignedToHugo(2).id, actor: system }),
    ]);
  });

  it('appends one task.updated.v1 for assigneeIds per task, by the system actor, and no other event', async () => {
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1), assignedToHugo(2)] });

    await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-1001', version: 4, changed: ['assigneeIds'], actor: system },
      { kind: 'updated', key: 'CAD-1002', version: 4, changed: ['assigneeIds'], actor: system },
    ]);
  });

  it('touches nothing in another organization', async () => {
    const tasks = new InMemoryTasks({
      tasks: [assignedToHugo(1, { organizationId: OTHER_ORGANIZATION })],
    });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ outcome: 'completed', unassigned: 0, batches: 0 });
    expect(tasks.stored(assignedToHugo(1).id).assigneeIds).toEqual([HUGO]);
  });

  it('keeps the other assignees in their order', async () => {
    const tasks = new InMemoryTasks({
      tasks: [assignedToHugo(1, { assigneeIds: [INES, HUGO, CAMILLE] })],
    });

    await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(tasks.stored(assignedToHugo(1).id).assigneeIds).toEqual([INES, CAMILLE]);
  });

  it('finds nothing to do the second time, so a job run again is harmless', async () => {
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1)] });
    const useCase = new UnassignRemovedMember(tasks, atelierNordMembers([HUGO]));

    await useCase.execute({ organizationId: ATELIER_NORD, userId: HUGO });
    const second = await useCase.execute({ organizationId: ATELIER_NORD, userId: HUGO });

    expect(second).toEqual({ outcome: 'completed', unassigned: 0, batches: 0 });
    expect(tasks.events).toHaveLength(1);
  });
});

describe('UnassignRemovedMember: the job stops for good once the person is a member again', () => {
  it('locks the batch before it reads the copy, and writes nothing when the copy holds the account again', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1)], trace });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([], trace)).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ outcome: 'member-again', unassigned: 0, batches: 0 });
    expect(trace).toEqual(['tasks.lockAssignedTo', `members.roleOf:${HUGO}:read`]);
    expect(tasks.stored(assignedToHugo(1).id).assigneeIds).toEqual([HUGO]);
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
  });

  it('keeps the batches committed before a re-join and leaves every later task, a new assignment included, as it is', async () => {
    const tasks = new InMemoryTasks({ tasks: manyAssignedToHugo(1200) });
    const copy = changingCopy([null, 'member']);

    const output = await new UnassignRemovedMember(tasks, copy.members).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ outcome: 'member-again', unassigned: 500, batches: 1 });
    expect(copy.readings()).toBe(2);
    const stillAssigned = [...tasks.tasks.values()].filter((row) => row.assigneeIds.includes(HUGO));
    expect(stillAssigned).toHaveLength(700);
    expect(stillAssigned.every((row) => row.version === 3)).toBe(true);
    expect(tasks.events).toHaveLength(500);
    expect(tasks.activity.size).toBe(500);
  });

  it('does not read the copy when nothing is left to unassign', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ tasks: [cad490State({ assigneeIds: [CAMILLE] })], trace });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([], trace)).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ outcome: 'completed', unassigned: 0, batches: 0 });
    expect(trace).toEqual(['tasks.lockAssignedTo']);
  });
});

describe('UnassignRemovedMember: a task that lost the account before it was locked', () => {
  it('writes, records and announces only the tasks it changed, and counts only them', async () => {
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1), assignedToHugo(2)] });
    const written: string[][] = [];
    const racing = wrapped(tasks, (store) => ({
      tasks: {
        ...store.tasks,
        // The account was deleted from the second task by a concurrent write between the read of
        // its assignee rows and the lock: the task comes back without it.
        lockAssignedTo: async (
          organizationId: string,
          userId: string,
          afterId: string | null,
          limit: number,
        ): Promise<readonly Task[]> =>
          (await store.tasks.lockAssignedTo(organizationId, userId, afterId, limit)).map((task) =>
            task.snapshot.id === assignedToHugo(2).id
              ? Task.restore({ ...task.snapshot, assigneeIds: [] })
              : task,
          ),
        unassignBatch: (
          organizationId: string,
          userId: string,
          updated: readonly Task[],
        ): Promise<void> => {
          written.push(updated.map((task) => task.snapshot.id));
          return store.tasks.unassignBatch(organizationId, userId, updated);
        },
      },
    }));

    const output = await new UnassignRemovedMember(racing, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ outcome: 'completed', unassigned: 1, batches: 1 });
    expect(written).toEqual([[assignedToHugo(1).id]]);
    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-1001', version: 4, changed: ['assigneeIds'], actor: system },
    ]);
    expect([...tasks.activity.values()]).toEqual([
      expect.objectContaining({ taskId: assignedToHugo(1).id }),
    ]);
  });

  it('writes nothing when no task of the batch changed', async () => {
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1)] });
    const racing = wrapped(tasks, (store) => ({
      tasks: {
        ...store.tasks,
        lockAssignedTo: async (
          organizationId: string,
          userId: string,
          afterId: string | null,
          limit: number,
        ): Promise<readonly Task[]> =>
          (await store.tasks.lockAssignedTo(organizationId, userId, afterId, limit)).map((task) =>
            Task.restore({ ...task.snapshot, assigneeIds: [] }),
          ),
      },
    }));

    const output = await new UnassignRemovedMember(racing, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ outcome: 'completed', unassigned: 0, batches: 1 });
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
  });
});

describe('UnassignRemovedMember: the batches come without checklist', () => {
  it('leaves the checklists of the tasks it rewrites as they were', async () => {
    const withChecklist: TaskState = assignedToHugo(1, {
      checklist: [
        { id: '019a7300-0000-7000-8000-000000000001', text: 'Valider', done: true, position: 0 },
      ],
    });
    const tasks = new InMemoryTasks({ tasks: [withChecklist] });

    await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(tasks.stored(withChecklist.id).checklist).toEqual(withChecklist.checklist);
  });
});

describe('UnassignRemovedMember: batches of 500, each in its own transaction, after the last id of the previous one', () => {
  it('walks 1,200 tasks in three transactions, each written in one set-based call', async () => {
    const tasks = new InMemoryTasks({ tasks: manyAssignedToHugo(1200) });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ outcome: 'completed', unassigned: 1200, batches: 3 });
    expect(tasks.runs).toBe(3);
    expect(tasks.trace.filter((call) => call === 'tasks.lockAssignedTo')).toHaveLength(3);
    expect(tasks.trace.filter((call) => call === 'tasks.unassignBatch')).toHaveLength(3);
    expect(tasks.events).toHaveLength(1200);
    expect(tasks.activity.size).toBe(1200);
  });

  it('starts each batch after the last task id of the one before', async () => {
    const tasks = new InMemoryTasks({ tasks: manyAssignedToHugo(1200) });
    const afterIds: (string | null)[] = [];
    const spied = wrapped(tasks, (store) => ({
      tasks: {
        ...store.tasks,
        lockAssignedTo: (
          organizationId: string,
          userId: string,
          afterId: string | null,
          limit: number,
        ): Promise<readonly Task[]> => {
          afterIds.push(afterId);
          expect(limit).toBe(500);
          return store.tasks.lockAssignedTo(organizationId, userId, afterId, limit);
        },
      },
    }));

    await new UnassignRemovedMember(spied, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(afterIds).toEqual([null, assignedToHugo(499).id, assignedToHugo(999).id]);
  });

  it('asks for one more batch, found empty, when the count is a multiple of 500', async () => {
    const tasks = new InMemoryTasks({ tasks: manyAssignedToHugo(1000) });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ outcome: 'completed', unassigned: 1000, batches: 2 });
    expect(tasks.trace.filter((call) => call === 'tasks.lockAssignedTo')).toHaveLength(3);
  });
});

describe('UnassignRemovedMember: a failed batch rolls back alone, and the next attempt resumes', () => {
  it('keeps the first batch when the second fails, then writes each remaining task once on the retry', async () => {
    const tasks = new InMemoryTasks({ tasks: manyAssignedToHugo(1200) });
    const failing = wrapped(tasks, (store) => ({
      events: {
        ...store.events,
        taskUpdated: (
          task: Task,
          changed: readonly TaskField[],
          actor: EventActor,
        ): Promise<void> =>
          task.snapshot.key.number === 1550
            ? Promise.reject(new Error('The outbox is unavailable.'))
            : store.events.taskUpdated(task, changed, actor),
      },
    }));

    await expect(
      new UnassignRemovedMember(failing, atelierNordMembers([HUGO])).execute({
        organizationId: ATELIER_NORD,
        userId: HUGO,
      }),
    ).rejects.toThrow('The outbox is unavailable.');

    const assigned = (): TaskState[] =>
      [...tasks.tasks.values()].filter((row) => row.assigneeIds.includes(HUGO));
    expect(assigned()).toHaveLength(700);
    expect(assigned().every((row) => row.key.number >= 1500)).toBe(true);
    expect(tasks.events).toHaveLength(500);
    expect(tasks.activity.size).toBe(500);

    const retry = await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(retry).toEqual({ outcome: 'completed', unassigned: 700, batches: 2 });
    expect(assigned()).toEqual([]);
    expect(new Set(tasks.events.map((event) => event.key)).size).toBe(1200);
    expect(tasks.events).toHaveLength(1200);
    expect(tasks.activity.size).toBe(1200);
    expect([...tasks.tasks.values()].every((row) => row.version === 4)).toBe(true);
  });

  it('starts no batch once the signal of the attempt aborted, and keeps the batches committed before', async () => {
    const tasks = new InMemoryTasks({ tasks: manyAssignedToHugo(1200) });
    const attempt = new AbortController();
    const expiring = wrapped(tasks, (store, run) => ({
      clock: {
        now: (): Promise<Date> => {
          if (run === 1) {
            attempt.abort(new Error('The attempt expired.'));
          }
          return store.clock.now();
        },
      },
    }));

    await expect(
      new UnassignRemovedMember(expiring, atelierNordMembers([HUGO])).execute({
        organizationId: ATELIER_NORD,
        userId: HUGO,
        signal: attempt.signal,
      }),
    ).rejects.toThrow('The attempt expired.');

    expect(tasks.runs).toBe(1);
    expect(tasks.events).toHaveLength(500);
  });
});
