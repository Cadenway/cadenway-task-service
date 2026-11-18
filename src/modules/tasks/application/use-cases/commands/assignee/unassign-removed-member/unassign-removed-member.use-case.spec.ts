import { describe, expect, it } from 'vitest';

import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
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
 * Builds a task of Atelier Nord assigned to Hugo Dubois.
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

describe('UnassignRemovedMember: a member who left is removed from every task they are assigned to', () => {
  it('removes the account from open and closed tasks and answers how many', async () => {
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

    expect(output).toEqual({ unassigned: 4 });
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

    expect(output).toEqual({ unassigned: 0 });
    expect(tasks.stored(assignedToHugo(1).id).assigneeIds).toEqual([HUGO]);
  });

  it('does nothing when the copy still holds the account as a member under another membership', async () => {
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1)] });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers()).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ unassigned: 0 });
    expect(tasks.stored(assignedToHugo(1).id).assigneeIds).toEqual([HUGO]);
    expect(tasks.events).toEqual([]);
    expect(tasks.trace).not.toContain('tasks.lockAssignedTo');
  });

  it('finds nothing to do the second time, so a redelivery is harmless', async () => {
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1)] });
    const useCase = new UnassignRemovedMember(tasks, atelierNordMembers([HUGO]));

    await useCase.execute({ organizationId: ATELIER_NORD, userId: HUGO });
    const second = await useCase.execute({ organizationId: ATELIER_NORD, userId: HUGO });

    expect(second).toEqual({ unassigned: 0 });
    expect(tasks.events).toHaveLength(1);
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
});

describe('UnassignRemovedMember: a task that lost the account before it was locked', () => {
  it('writes, records and announces only the tasks it changed, and counts only them', async () => {
    const tasks = new InMemoryTasks({ tasks: [assignedToHugo(1), assignedToHugo(2)] });
    const written: string[][] = [];
    const racing: InMemoryTasks['run'] = (work) =>
      tasks.run((store) =>
        work({
          ...store,
          tasks: {
            ...store.tasks,
            // The account was deleted from the second task by a concurrent write between the read
            // of its assignee rows and the lock: the task comes back without it.
            lockAssignedTo: async (organizationId, userId, afterId, limit) =>
              (await store.tasks.lockAssignedTo(organizationId, userId, afterId, limit)).map(
                (task) =>
                  task.snapshot.id === assignedToHugo(2).id
                    ? Task.restore({ ...task.snapshot, assigneeIds: [] })
                    : task,
              ),
            unassignBatch: (organizationId, userId, updated) => {
              written.push(updated.map((task) => task.snapshot.id));
              return store.tasks.unassignBatch(organizationId, userId, updated);
            },
          },
        }),
      );

    const output = await new UnassignRemovedMember(
      { run: racing, runReadOnly: (work, options) => tasks.runReadOnly(work, options) },
      atelierNordMembers([HUGO]),
    ).execute({ organizationId: ATELIER_NORD, userId: HUGO });

    expect(output).toEqual({ unassigned: 1 });
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
    const racing: InMemoryTasks['run'] = (work) =>
      tasks.run((store) =>
        work({
          ...store,
          tasks: {
            ...store.tasks,
            lockAssignedTo: async (organizationId, userId, afterId, limit) =>
              (await store.tasks.lockAssignedTo(organizationId, userId, afterId, limit)).map(
                (task) => Task.restore({ ...task.snapshot, assigneeIds: [] }),
              ),
          },
        }),
      );

    const output = await new UnassignRemovedMember(
      { run: racing, runReadOnly: (work, options) => tasks.runReadOnly(work, options) },
      atelierNordMembers([HUGO]),
    ).execute({ organizationId: ATELIER_NORD, userId: HUGO });

    expect(output).toEqual({ unassigned: 0 });
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

describe('UnassignRemovedMember: the tasks are rewritten in batches of 500', () => {
  it('walks 1,200 tasks in three batches, each written in one set-based call', async () => {
    const tasks = new InMemoryTasks({
      tasks: Array.from({ length: 1200 }, (_, index) => assignedToHugo(index)),
    });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ unassigned: 1200 });
    expect(tasks.trace.filter((call) => call === 'tasks.lockAssignedTo')).toHaveLength(3);
    expect(tasks.trace.filter((call) => call === 'tasks.unassignBatch')).toHaveLength(3);
    expect(tasks.events).toHaveLength(1200);
    expect(tasks.activity.size).toBe(1200);
  });

  it('asks for one more batch, found empty, when the count is a multiple of 500', async () => {
    const tasks = new InMemoryTasks({
      tasks: Array.from({ length: 1000 }, (_, index) => assignedToHugo(index)),
    });

    const output = await new UnassignRemovedMember(tasks, atelierNordMembers([HUGO])).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
    });

    expect(output).toEqual({ unassigned: 1000 });
    expect(tasks.trace.filter((call) => call === 'tasks.lockAssignedTo')).toHaveLength(3);
  });

  it('commits nothing when a write fails halfway, so the removal is redelivered whole', async () => {
    const tasks = new InMemoryTasks({
      tasks: Array.from({ length: 600 }, (_, index) => assignedToHugo(index)),
    });
    const failing: InMemoryTasks['run'] = (work) =>
      tasks.run((store) =>
        work({
          ...store,
          events: {
            ...store.events,
            taskUpdated: (task, changed, actor) =>
              task.snapshot.key.number === 1550
                ? Promise.reject(new Error('The outbox is unavailable.'))
                : store.events.taskUpdated(task, changed, actor),
          },
        }),
      );

    await expect(
      new UnassignRemovedMember(
        { run: failing, runReadOnly: (work, options) => tasks.runReadOnly(work, options) },
        atelierNordMembers([HUGO]),
      ).execute({
        organizationId: ATELIER_NORD,
        userId: HUGO,
      }),
    ).rejects.toThrow('The outbox is unavailable.');

    expect([...tasks.tasks.values()].every((row) => row.assigneeIds.includes(HUGO))).toBe(true);
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
  });
});
