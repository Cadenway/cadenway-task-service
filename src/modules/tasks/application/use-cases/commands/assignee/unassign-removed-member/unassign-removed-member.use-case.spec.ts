import { describe, expect, it } from 'vitest';

import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskField } from '../../../../../domain/value-objects/task/task-field.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
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
  trashIn,
} from '../../../tasks.fixture.js';

import type { UnassignRemovedMemberOutput } from './unassign-removed-member.output.js';
import { UnassignRemovedMember } from './unassign-removed-member.use-case.js';

const system = { type: 'system', id: 'task-service' } as const;

/** The first batch of the unassignment of Hugo Dubois in Atelier Nord. */
const first = { organizationId: ATELIER_NORD, userId: HUGO, afterTaskId: null } as const;

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
 * Calls the batch as the clean-up job does: from the first batch, after the last task id of the
 * previous one, until a batch answers `none-left` or `member-again`.
 *
 * @param useCase - The batch operation.
 * @returns Every answer, the last one included.
 */
async function drain(useCase: UnassignRemovedMember): Promise<UnassignRemovedMemberOutput[]> {
  const outputs: UnassignRemovedMemberOutput[] = [];
  let afterTaskId: string | null = null;
  for (;;) {
    const output: UnassignRemovedMemberOutput = await useCase.execute({ ...first, afterTaskId });
    outputs.push(output);
    if (output.outcome !== 'unassigned') {
      return outputs;
    }
    afterTaskId = output.lastTaskId;
  }
}

/**
 * Wraps the unit of work of the fake with a change of the store of each run.
 *
 * @param tasks - The fake.
 * @param change - What replaces parts of the store.
 * @returns A unit of work over the same rows.
 */
function wrapped(
  tasks: InMemoryTasks,
  change: (store: Parameters<Parameters<InMemoryTasks['run']>[0]>[0]) => object,
): TasksUnitOfWork {
  return {
    run: (work) => tasks.run((store) => work({ ...store, ...change(store) })),
    runReadOnly: (work, options) => tasks.runReadOnly(work, options),
  };
}

describe('UnassignRemovedMember: one batch removes a member who left from the tasks they are assigned to', () => {
  it('removes the account from open and closed tasks and answers how many, with the last task id', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        assignedToHugo(1),
        assignedToHugo(2, { status: 'done', completedAt: NOW }),
        assignedToHugo(3, { status: 'cancelled', cancelReason: 'scope' }),
        taskState({ assigneeIds: [CAMILLE, HUGO] }),
        cad490State({ assigneeIds: [CAMILLE] }),
      ],
    });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute(
      first,
    );

    expect(output).toEqual({
      outcome: 'unassigned',
      locked: 4,
      unassigned: 4,
      lastTaskId: assignedToHugo(3).id,
    });
    expect(tasks.runs).toBe(1);
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

    await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute(first);

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

    await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute(first);

    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-1001', version: 4, changed: ['assigneeIds'], actor: system },
      { kind: 'updated', key: 'CAD-1002', version: 4, changed: ['assigneeIds'], actor: system },
    ]);
  });

  it('unassigns a task in the trash too, at its next version, but emits no task.updated.v1 for it', async () => {
    const trashed: TaskState = assignedToHugo(2, { trash: trashIn() });
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1), trashed] });

    await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute(first);

    expect(tasks.stored(trashed.id)).toMatchObject({
      assigneeIds: [],
      version: 4,
      trash: trashIn(),
    });
    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-1001', version: 4, changed: ['assigneeIds'], actor: system },
    ]);
    expect([...tasks.activity.values()].map((entry) => entry.taskId)).toEqual([
      assignedToHugo(1).id,
      trashed.id,
    ]);
  });

  it('touches nothing in another organization', async () => {
    const tasks = new InMemoryTasks({
      tasks: [assignedToHugo(1, { organizationId: OTHER_ORGANIZATION })],
    });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute(
      first,
    );

    expect(output).toEqual({ outcome: 'none-left' });
    expect(tasks.stored(assignedToHugo(1).id).assigneeIds).toEqual([HUGO]);
  });

  it('keeps the other assignees in their order', async () => {
    const tasks = new InMemoryTasks({
      tasks: [assignedToHugo(1, { assigneeIds: [INES, HUGO, CAMILLE] })],
    });

    await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute(first);

    expect(tasks.stored(assignedToHugo(1).id).assigneeIds).toEqual([INES, CAMILLE]);
  });

  it('answers none-left from the first batch once nothing is left, so a job run again is harmless', async () => {
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1)] });
    const useCase = new UnassignRemovedMember(tasks, atelierNordMembers([HUGO]));

    await drain(useCase);
    const again = await useCase.execute(first);

    expect(again).toEqual({ outcome: 'none-left' });
    expect(tasks.events).toHaveLength(1);
  });
});

describe('UnassignRemovedMember: a batch writes nothing once the person is a member again', () => {
  it('locks the batch before it reads the copy, and writes nothing when the copy holds the account again', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1)], trace });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([], trace)).execute(
      first,
    );

    expect(output).toEqual({ outcome: 'member-again' });
    expect(trace).toEqual(['tasks.lockAssignedTo', `members.roleOf:${HUGO}:read`]);
    expect(tasks.stored(assignedToHugo(1).id).assigneeIds).toEqual([HUGO]);
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
  });

  it('does not read the copy when nothing is left to unassign', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ tasks: [cad490State({ assigneeIds: [CAMILLE] })], trace });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([], trace)).execute(
      first,
    );

    expect(output).toEqual({ outcome: 'none-left' });
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

    const output = await new UnassignRemovedMember(racing, atelierNordMembers([HUGO])).execute(
      first,
    );

    expect(output).toEqual({
      outcome: 'unassigned',
      locked: 2,
      unassigned: 1,
      lastTaskId: assignedToHugo(2).id,
    });
    expect(written).toEqual([[assignedToHugo(1).id]]);
    expect(tasks.events).toEqual([
      { kind: 'updated', key: 'CAD-1001', version: 4, changed: ['assigneeIds'], actor: system },
    ]);
    expect([...tasks.activity.values()]).toEqual([
      expect.objectContaining({ taskId: assignedToHugo(1).id }),
    ]);
  });

  it('writes nothing when no task of the batch changed, and still moves past it', async () => {
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

    const output = await new UnassignRemovedMember(racing, atelierNordMembers([HUGO])).execute(
      first,
    );

    expect(output).toEqual({
      outcome: 'unassigned',
      locked: 1,
      unassigned: 0,
      lastTaskId: assignedToHugo(1).id,
    });
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

    await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute(first);

    expect(tasks.stored(withChecklist.id).checklist).toEqual(withChecklist.checklist);
  });
});

describe('UnassignRemovedMember: batches of 500, each in its own transaction, after the last id of the previous one', () => {
  it('walks 1,200 tasks in three transactions written in one set-based call each, then a fourth that finds none', async () => {
    const tasks = new InMemoryTasks({ tasks: manyAssignedToHugo(1200) });

    const outputs = await drain(new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])));

    expect(outputs).toEqual([
      { outcome: 'unassigned', locked: 500, unassigned: 500, lastTaskId: assignedToHugo(499).id },
      { outcome: 'unassigned', locked: 500, unassigned: 500, lastTaskId: assignedToHugo(999).id },
      { outcome: 'unassigned', locked: 200, unassigned: 200, lastTaskId: assignedToHugo(1199).id },
      { outcome: 'none-left' },
    ]);
    expect(tasks.runs).toBe(4);
    expect(tasks.trace.filter((call) => call === 'tasks.unassignBatch')).toHaveLength(3);
    expect(tasks.events).toHaveLength(1200);
    expect(tasks.activity.size).toBe(1200);
  });

  it('starts a batch after the task id it is given, 500 at most', async () => {
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

    await drain(new UnassignRemovedMember(spied, atelierNordMembers([HUGO])));

    expect(afterIds).toEqual([
      null,
      assignedToHugo(499).id,
      assignedToHugo(999).id,
      assignedToHugo(1199).id,
    ]);
  });
});

describe('UnassignRemovedMember: a failed batch rolls back alone, and a new attempt resumes', () => {
  it('keeps the first batch when the second fails, then writes each remaining task once from the first batch again', async () => {
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
      drain(new UnassignRemovedMember(failing, atelierNordMembers([HUGO]))),
    ).rejects.toThrow('The outbox is unavailable.');

    const assigned = (): TaskState[] =>
      [...tasks.tasks.values()].filter((row) => row.assigneeIds.includes(HUGO));
    expect(assigned()).toHaveLength(700);
    expect(assigned().every((row) => row.key.number >= 1500)).toBe(true);
    expect(tasks.events).toHaveLength(500);
    expect(tasks.activity.size).toBe(500);

    const retry = await drain(new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])));

    expect(retry.map((output) => output.outcome)).toEqual([
      'unassigned',
      'unassigned',
      'none-left',
    ]);
    expect(assigned()).toEqual([]);
    expect(new Set(tasks.events.map((event) => event.key)).size).toBe(1200);
    expect(tasks.events).toHaveLength(1200);
    expect(tasks.activity.size).toBe(1200);
    expect([...tasks.tasks.values()].every((row) => row.version === 4)).toBe(true);
  });
});
