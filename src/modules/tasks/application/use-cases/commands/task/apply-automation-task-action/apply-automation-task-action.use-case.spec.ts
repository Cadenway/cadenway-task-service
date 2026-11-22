import { describe, expect, it, vi } from 'vitest';

import { delegatedMembershipFixture } from '../../../delegated-membership.fixture.js';
import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  HUGO,
  INES,
  NADIA,
  InMemorySpaceDirectory,
  InMemoryTasks,
  atelierNordMembers,
  placedList,
  placedSpace,
  refusalOf,
  sprint14SharedWith,
  taskState,
} from '../../../tasks.fixture.js';
import type { ApplyAutomationTaskActionInput } from './apply-automation-task-action.input.js';
import { ApplyAutomationTaskAction } from './apply-automation-task-action.use-case.js';

const ruleId = '01938f6e-0000-7000-8000-000000000091';
const input: ApplyAutomationTaskActionInput = {
  organizationId: ATELIER_NORD,
  taskKey: 'CAD-482',
  ruleId,
  ruleAuthorUserId: CAMILLE,
  action: { type: 'priority', priority: 'urgente' },
};

function setup(stored = [taskState()]) {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ tasks: stored, trace });
  return {
    tasks,
    ...build(tasks, new InMemorySpaceDirectory({ trace }), trace),
  };
}

function build(tasks: InMemoryTasks, spaces: InMemorySpaceDirectory, trace: string[] = []) {
  const fixture = delegatedMembershipFixture(atelierNordMembers([], trace));
  return { ...fixture, useCase: new ApplyAutomationTaskAction(tasks, spaces, fixture.memberships) };
}

describe('ApplyAutomationTaskAction', () => {
  it('updates priority and records the rule as actor in activity and the outbox', async () => {
    const { tasks, useCase } = setup();
    await expect(useCase.execute(input)).resolves.toEqual({ disposition: 'applied' });
    expect(tasks.stored(CAD_482)).toMatchObject({ priority: 'urgente', version: 13 });
    expect(tasks.entriesOf(CAD_482)).toEqual([
      expect.objectContaining({ actor: { type: 'automation', id: ruleId } }),
    ]);
    expect(tasks.events).toEqual([
      expect.objectContaining({
        kind: 'updated',
        changed: ['priority'],
        actor: { type: 'automation', id: ruleId },
      }),
    ]);
  });

  it('leaves an unchanged priority without activity or events', async () => {
    const { tasks, useCase } = setup([taskState({ priority: 'urgente' })]);
    await expect(useCase.execute(input)).resolves.toEqual({ disposition: 'no_op' });
    expect(tasks.stored(CAD_482).version).toBe(12);
    expect(tasks.events).toEqual([]);
    expect(tasks.entriesOf(CAD_482)).toEqual([]);
  });

  it('assigns an eligible member and records both events under the rule actor', async () => {
    const { tasks, useCase } = setup();
    await expect(
      useCase.execute({ ...input, action: { type: 'assign', userId: HUGO } }),
    ).resolves.toEqual({ disposition: 'applied' });
    expect(tasks.stored(CAD_482).assigneeIds).toEqual([CAMILLE, INES, HUGO]);
    expect(tasks.events.map((event) => event.actor)).toEqual([
      { type: 'automation', id: ruleId },
      { type: 'automation', id: ruleId },
    ]);
    expect(tasks.trace.filter((call) => call.endsWith(':lock')).slice(0, 3)).toEqual([
      `members.roleOf:${CAMILLE}:lock`,
      `members.roleOf:${HUGO}:lock`,
      'tasks.findByKey:lock',
    ]);
  });

  it('refuses an ineligible recipient even when that person is already assigned', async () => {
    const { tasks, useCase } = setup([taskState({ assigneeIds: [NADIA] })]);
    expect(
      await refusalOf(useCase.execute({ ...input, action: { type: 'assign', userId: NADIA } })),
    ).toEqual({ reason: 'assignee-invalid', userIds: [NADIA] });
    expect(tasks.events).toEqual([]);
  });

  it('refuses assignment beyond the limit', async () => {
    const twenty = Array.from(
      { length: 20 },
      (_, index) => `019a5f3c-8d2e-7c4a-9b1f-${String(index).padStart(12, '0')}`,
    );
    const { useCase } = setup([taskState({ assigneeIds: twenty })]);
    expect(
      await refusalOf(useCase.execute({ ...input, action: { type: 'assign', userId: HUGO } })),
    ).toEqual({ reason: 'assignee-limit-reached' });
  });

  it('rechecks the rule author on the pre-replay authorization path', async () => {
    const { useCase, authority, projection } = setup();
    await expect(useCase.authorize(input)).resolves.toMatchObject({ organizationId: ATELIER_NORD });
    vi.spyOn(authority, 'find').mockResolvedValue(null);
    const project = vi.spyOn(projection, 'stampOf');
    expect(await refusalOf(useCase.authorize(input))).toEqual({
      reason: 'organization-not-found',
    });
    expect(project).not.toHaveBeenCalled();
  });

  it('does not apply when Organization cannot prove the membership', async () => {
    const { authority, tasks, useCase } = setup();
    const unavailable = new Error('Authority unavailable.');
    vi.spyOn(authority, 'find').mockRejectedValue(unavailable);
    await expect(useCase.execute(input)).rejects.toBe(unavailable);
    expect(tasks.events).toEqual([]);
  });

  it('refuses an assignment when only its recipient has left at the source', async () => {
    const { authority, tasks, useCase } = setup();
    vi.spyOn(authority, 'find').mockImplementation((_organizationId, userId) =>
      Promise.resolve(userId === CAMILLE ? { memberId: CAMILLE, role: 'owner', version: 1 } : null),
    );
    expect(
      await refusalOf(useCase.execute({ ...input, action: { type: 'assign', userId: HUGO } })),
    ).toEqual({ reason: 'assignee-invalid', userIds: [HUGO] });
    expect(tasks.events).toEqual([]);
  });

  it('refuses a recipient who is no longer eligible before replaying an assignment', async () => {
    const { tasks, useCase } = setup([taskState({ assigneeIds: [NADIA] })]);
    const assignment: ApplyAutomationTaskActionInput = {
      ...input,
      action: { type: 'assign', userId: NADIA },
    };
    expect(await refusalOf(useCase.authorize(assignment))).toEqual({
      reason: 'assignee-invalid',
      userIds: [NADIA],
    });
    expect(tasks.events).toEqual([]);
    expect(tasks.entriesOf(CAD_482)).toEqual([]);
  });

  it('allows an already assigned eligible recipient on pre-replay authorization', async () => {
    const { tasks, useCase } = setup();
    await expect(
      useCase.authorize({ ...input, action: { type: 'assign', userId: INES } }),
    ).resolves.toMatchObject({ organizationId: ATELIER_NORD });
    expect(tasks.events).toEqual([]);
  });

  it('refuses a rule author who has only read access', async () => {
    const tasks = InMemoryTasks.withCad482();
    const { useCase } = build(tasks, sprint14SharedWith({ [HUGO]: 'view' }));
    expect(await refusalOf(useCase.execute({ ...input, ruleAuthorUserId: HUGO }))).toEqual({
      reason: 'role-insufficient',
      role: 'view',
    });
    expect(tasks.events).toEqual([]);
  });

  it.each(['execute', 'authorize'] as const)(
    'refuses an archived list when checking %s',
    async (method) => {
      const tasks = InMemoryTasks.withCad482();
      const spaces = new InMemorySpaceDirectory({
        lists: [placedList({ archivedAt: new Date('2026-11-10T00:00:00Z') })],
      });
      const { useCase } = build(tasks, spaces);
      expect(await refusalOf(useCase[method](input))).toEqual({ reason: 'task-not-found' });
      expect(tasks.events).toEqual([]);
      expect(tasks.stored(CAD_482).version).toBe(12);
    },
  );

  it('rechecks the list archive after acquiring its placement lock', async () => {
    const tasks = InMemoryTasks.withCad482();
    const spaces = new InMemorySpaceDirectory();
    vi.spyOn(spaces, 'findVisibleList')
      .mockResolvedValueOnce({ list: placedList(), space: placedSpace() })
      .mockResolvedValueOnce({
        list: placedList({ archivedAt: new Date('2026-11-10T00:00:00Z') }),
        space: placedSpace(),
      });
    const { useCase } = build(tasks, spaces);
    expect(await refusalOf(useCase.execute(input))).toEqual({ reason: 'task-not-found' });
    expect(spaces.lockTrashCalls).toHaveLength(1);
    expect(tasks.events).toEqual([]);
  });
});
