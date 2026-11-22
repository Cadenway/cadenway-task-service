import { describe, expect, it, vi } from 'vitest';

import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { delegatedMembershipFixture } from '../../../delegated-membership.fixture.js';
import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  DESIGN,
  InMemorySpaceDirectory,
  InMemoryTasks,
  MAQUETTES,
  NADIA,
  PRODUIT,
  SPRINT_14,
  archiveFrom,
  atelierNordMembers,
  placedList,
  placedSpace,
  taskState,
} from '../../../tasks.fixture.js';
import type { ApplyGitTaskStatusInput } from './apply-git-task-status.input.js';
import { ApplyGitTaskStatus } from './apply-git-task-status.use-case.js';

const input: ApplyGitTaskStatusInput = {
  organizationId: ATELIER_NORD,
  integrationId: '019a700b-1a2b-7c3d-8e4f-5a6b7c8d9e01',
  mappingAuthorUserId: CAMILLE,
  taskKey: 'CAD-482',
  spaceId: PRODUIT,
  provider: 'github',
  status: 'review',
};

function build(
  work: TasksUnitOfWork,
  members = atelierNordMembers(),
  spaces = new InMemorySpaceDirectory(),
) {
  const fixture = delegatedMembershipFixture(members);
  return {
    ...fixture,
    useCase: new ApplyGitTaskStatus(work, members, spaces, fixture.memberships),
  };
}

function setup(state: TaskState = taskState(), removed: readonly string[] = []) {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ tasks: [state], trace });
  const spaces = new InMemorySpaceDirectory({ trace });
  const members = atelierNordMembers([], trace);
  const fixture = delegatedMembershipFixture(members, atelierNordMembers(removed));
  const useCase = new ApplyGitTaskStatus(tasks, members, spaces, fixture.memberships);
  return { tasks, spaces, useCase, trace, ...fixture };
}

describe('ApplyGitTaskStatus', () => {
  it.each(['execute', 'authorize'] as const)(
    'refuses an archived list while checking %s',
    async (method) => {
      const tasks = InMemoryTasks.withCad482();
      const spaces = new InMemorySpaceDirectory({
        lists: [placedList({ archivedAt: new Date('2026-11-10T00:00:00Z') })],
      });
      const { useCase } = build(tasks, atelierNordMembers(), spaces);
      await expect(useCase[method](input)).rejects.toMatchObject({
        refusal: { reason: 'task-not-found' },
      });
      expect(tasks.events).toEqual([]);
      expect(tasks.stored(CAD_482).version).toBe(12);
    },
  );

  it('authorizes the current mapping under locks without a task, activity or outbox write', async () => {
    const { tasks, trace, useCase } = setup();
    const original = tasks.stored(CAD_482);
    await expect(useCase.authorize(input)).resolves.toEqual({
      organizationId: ATELIER_NORD,
      stamps: new Map([[CAMILLE, { memberId: CAMILLE, role: 'owner', version: 1 }]]),
    });
    expect(trace).toContain('spaces.lockTrashLists');
    expect(tasks.stored(CAD_482)).toEqual(original);
    expect(tasks.activity.size).toBe(0);
    expect(tasks.events).toEqual([]);
    expect(tasks.jobs).toEqual([]);
  });

  it('rechecks the mapping author when a previously authorized operation is replayed', async () => {
    const { tasks, useCase, authority, projection } = setup();
    await expect(useCase.authorize(input)).resolves.toMatchObject({ organizationId: ATELIER_NORD });
    const project = vi.spyOn(projection, 'stampOf');
    vi.spyOn(authority, 'find').mockResolvedValue(null);

    await expect(useCase.authorize(input)).rejects.toMatchObject({
      refusal: { reason: 'organization-not-found' },
    });
    await expect(useCase.execute(input)).rejects.toMatchObject({
      refusal: { reason: 'organization-not-found' },
    });
    expect(project).not.toHaveBeenCalled();
    expect(tasks.stored(CAD_482)).toEqual(taskState());
    expect(tasks.activity.size).toBe(0);
    expect(tasks.events).toEqual([]);
  });

  it('refuses reauthorization after moving the task outside the mapped space', async () => {
    const { tasks, useCase } = setup();
    await expect(useCase.authorize(input)).resolves.toMatchObject({ organizationId: ATELIER_NORD });
    tasks.tasks.set(CAD_482, taskState({ spaceId: DESIGN, listId: MAQUETTES }));
    await expect(useCase.authorize(input)).rejects.toMatchObject({
      refusal: { reason: 'task-not-found' },
    });
    expect(tasks.events).toEqual([]);
  });

  it('advances CAD-482 and records Git as the actor on activity and both facts', async () => {
    const { tasks, useCase } = setup();
    await expect(useCase.execute(input)).resolves.toEqual({
      disposition: 'applied',
      taskId: CAD_482,
      listId: SPRINT_14,
      spaceId: PRODUIT,
    });
    expect(tasks.stored(CAD_482)).toMatchObject({ status: 'review', version: 13 });
    expect(tasks.events).toEqual([
      expect.objectContaining({ kind: 'updated', actor: { type: 'git', id: input.integrationId } }),
      expect.objectContaining({
        kind: 'statusChanged',
        actor: { type: 'git', id: input.integrationId },
      }),
    ]);
    expect([...tasks.activity.values()]).toEqual([
      expect.objectContaining({
        actor: { type: 'git', id: input.integrationId, provider: 'github' },
      }),
    ]);
  });

  it.each(['todo', 'progress', 'cancelled', null] as const)(
    'returns an authorized no-op for target %s without writing',
    async (status) => {
      const { tasks, useCase } = setup();
      await expect(useCase.execute({ ...input, status })).resolves.toMatchObject({
        disposition: 'no_op',
        taskId: CAD_482,
      });
      expect(tasks.stored(CAD_482)).toMatchObject({ status: 'progress', version: 12 });
      expect(tasks.events).toEqual([]);
      expect(tasks.activity.size).toBe(0);
    },
  );

  it('refuses a mapping into another space after locking the current placement', async () => {
    const { tasks, useCase } = setup();
    await expect(useCase.execute({ ...input, spaceId: DESIGN })).rejects.toMatchObject({
      refusal: { reason: 'task-not-found' },
    });
    expect(tasks.events).toEqual([]);
  });

  it('refuses a mapping whose author has left', async () => {
    const { tasks, useCase } = setup(taskState(), [CAMILLE]);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      refusal: { reason: 'organization-not-found' },
    });
    expect(tasks.events).toEqual([]);
  });

  it.each([
    { memberId: NADIA, role: 'owner', version: 1 },
    { memberId: CAMILLE, role: 'member', version: 1 },
    { memberId: CAMILLE, role: 'owner', version: 2 },
  ] as const)('does not mutate when the proof and projected stamp disagree', async (stamp) => {
    const { tasks, useCase, projection } = setup();
    const proof = await useCase.authorize(input);
    vi.spyOn(projection, 'stampOf').mockResolvedValue(stamp);
    await expect(useCase.execute(input, proof)).rejects.toThrow('do not agree');
    expect(tasks.events).toEqual([]);
    expect(tasks.stored(CAD_482)).toEqual(taskState());
  });

  it('refuses an archived task before returning a placement', async () => {
    const { tasks, useCase } = setup(taskState({ archive: archiveFrom(CAD_482) }));
    await expect(useCase.execute({ ...input, status: null })).rejects.toMatchObject({
      refusal: { reason: 'task-archived' },
    });
    expect(tasks.events).toEqual([]);
  });

  it('writes no second activity or fact for the same resulting status', async () => {
    const { tasks, useCase } = setup();
    await expect(useCase.execute(input)).resolves.toMatchObject({ disposition: 'applied' });
    await expect(useCase.execute(input)).resolves.toMatchObject({ disposition: 'no_op' });
    expect(tasks.events).toHaveLength(2);
    expect(tasks.activity.size).toBe(1);
  });

  it('refuses a mapping author who can only view the task', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const spaces = new InMemorySpaceDirectory({ listGrants: { [SPRINT_14]: { [NADIA]: 'view' } } });
    const { useCase } = build(tasks, atelierNordMembers(), spaces);
    await expect(useCase.execute({ ...input, mappingAuthorUserId: NADIA })).rejects.toMatchObject({
      refusal: { reason: 'role-insufficient', role: 'view' },
    });
    expect(tasks.events).toEqual([]);
  });

  it('returns no-op when the target status is hidden', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const space = placedSpace();
    const spaces = new InMemorySpaceDirectory({
      spaces: [{ ...space, statuses: { ...space.statuses, review: { name: null, hidden: true } } }],
    });
    const { useCase } = build(tasks, atelierNordMembers(), spaces);
    await expect(useCase.execute(input)).resolves.toMatchObject({ disposition: 'no_op' });
    expect(tasks.events).toEqual([]);
  });

  it('rolls back the task and activity if the status event cannot be appended', async () => {
    const original = taskState();
    const tasks = new InMemoryTasks({ tasks: [original] });
    const work: TasksUnitOfWork = {
      run: (operation) =>
        tasks.run((store) =>
          operation({
            ...store,
            events: {
              ...store.events,
              taskStatusChanged: () => Promise.reject(new Error('outbox failed')),
            },
          }),
        ),
      runReadOnly: (operation, options) => tasks.runReadOnly(operation, options),
    };
    const { useCase } = build(work, atelierNordMembers(), new InMemorySpaceDirectory());
    await expect(useCase.execute(input)).rejects.toThrow('outbox failed');
    expect(tasks.stored(CAD_482)).toEqual(original);
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
  });

  it('completes a recurring task with an attributed successor in the same transaction', async () => {
    const { tasks, useCase } = setup(
      taskState({
        recurrence: 'weekly',
        dueDate: '2026-11-12',
        startDate: '2026-11-10',
        assigneeIds: [CAMILLE],
      }),
    );
    await expect(useCase.execute({ ...input, status: 'done' })).resolves.toMatchObject({
      disposition: 'applied',
    });
    expect(tasks.stored(CAD_482)).toMatchObject({ status: 'done' });
    expect(tasks.stored(CAD_482).nextOccurrenceKey?.format()).toBe('CAD-496');
    expect([...tasks.tasks.values()].find((row) => row.key.format() === 'CAD-496')).toMatchObject({
      status: 'todo',
      createdBy: { type: 'git', id: input.integrationId },
    });
    expect([...tasks.activity.values()]).toContainEqual(
      expect.objectContaining({
        change: { kind: 'create' },
        actor: { type: 'git', id: input.integrationId, provider: 'github' },
      }),
    );
    expect(tasks.events.map((event) => event.kind)).toEqual([
      'updated',
      'statusChanged',
      'created',
      'assigned',
      'occurrenceCreated',
    ]);
  });
});
