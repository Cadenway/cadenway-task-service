import { describe, expect, it, vi } from 'vitest';

import { delegatedMembershipFixture } from '../../../delegated-membership.fixture.js';
import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAMILLE,
  HUGO,
  HUGO_ACTOR,
  INES,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NADIA,
  OTHER_ORGANIZATION,
  PRODUIT,
  SPRINT_14,
  STRANGER,
  archiveFrom,
  atelierNordLists,
  atelierNordMembers,
  refusalOf,
  sprint14SharedWith,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import type { AuthorizeAutomationNotificationInput } from './authorize-automation-notification.input.js';
import { AuthorizeAutomationNotification } from './authorize-automation-notification.use-case.js';

function input(
  overrides: Partial<AuthorizeAutomationNotificationInput> = {},
): AuthorizeAutomationNotificationInput {
  return {
    organizationId: ATELIER_NORD,
    taskKey: 'CAD-482',
    ruleAuthorUserId: CAMILLE,
    recipientUserId: HUGO,
    ...overrides,
  };
}

function setup(
  options: {
    readonly tasks?: InMemoryTasks;
    readonly spaces?: InMemorySpaceDirectory;
    readonly removed?: readonly string[];
  } = {},
) {
  const tasks = options.tasks ?? new InMemoryTasks({ tasks: [taskState()] });
  const spaces = options.spaces ?? new InMemorySpaceDirectory();
  const members = atelierNordMembers();
  const fixture = delegatedMembershipFixture(members, atelierNordMembers(options.removed));
  return {
    tasks,
    spaces,
    members,
    ...fixture,
    useCase: new AuthorizeAutomationNotification(tasks, spaces, fixture.memberships),
  };
}

describe('AuthorizeAutomationNotification', () => {
  it.each(['view', 'comment', 'edit'] as const)(
    'allows a recipient with %s access while checking both accounts in one snapshot',
    async (role) => {
      const spaces = sprint14SharedWith({ [HUGO]: role });
      const { tasks, members, useCase } = setup({ spaces });

      await expect(useCase.execute(input())).resolves.toBeUndefined();
      expect(tasks.runs).toBe(1);
      expect(tasks.readOnlyRuns).toBe(1);
      expect(tasks.snapshotRuns).toBe(1);
      expect(members.roleCalls).toEqual([
        { userId: CAMILLE, lock: false },
        { userId: HUGO, lock: false },
      ]);
      expect(spaces.findCalls).toEqual([SPRINT_14, SPRINT_14]);
      expect(tasks.events).toEqual([]);
    },
  );

  it('allows a current guest with a list read grant', async () => {
    const { useCase } = setup({ spaces: sprint14SharedWith({ [NADIA]: 'view' }) });
    await expect(useCase.execute(input({ recipientUserId: NADIA }))).resolves.toBeUndefined();
  });

  it.each(['view', 'comment'] as const)('masks an author with only %s access', async (role) => {
    const spaces = sprint14SharedWith({ [HUGO]: role });
    expect(
      await refusalOf(setup({ spaces }).useCase.execute(input({ ruleAuthorUserId: HUGO }))),
    ).toEqual({ reason: 'task-not-found' });
  });

  it.each([
    { removed: [CAMILLE], input: {} },
    { removed: [HUGO], input: {} },
    { removed: [], input: { recipientUserId: STRANGER } },
    { removed: [], input: { organizationId: OTHER_ORGANIZATION } },
  ])('masks a removed or cross-tenant membership', async ({ removed, input: overrides }) => {
    expect(await refusalOf(setup({ removed }).useCase.execute(input(overrides)))).toEqual({
      reason: 'task-not-found',
    });
  });

  it.each([{ taskKey: 'cad-482' }, { taskKey: 'CAD-999' }, { recipientUserId: INES }])(
    'masks an invalid, missing or inaccessible task',
    async (overrides) => {
      const spaces = sprint14SharedWith({ [HUGO]: 'view' });
      expect(await refusalOf(setup({ spaces }).useCase.execute(input(overrides)))).toEqual({
        reason: 'task-not-found',
      });
    },
  );

  it('checks the recipient against the current list after a move', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ listId: BUGS })] });
    const spaces = new InMemorySpaceDirectory({
      lists: atelierNordLists({ organizationAccess: false }),
      listGrants: { [SPRINT_14]: { [NADIA]: 'view' } },
    });
    expect(
      await refusalOf(setup({ tasks, spaces }).useCase.execute(input({ recipientUserId: NADIA }))),
    ).toEqual({
      reason: 'task-not-found',
    });
  });

  it.each([
    new InMemoryTasks({ tasks: [taskState({ archive: archiveFrom(CAD_482) })] }),
    new InMemoryTasks({ tasks: [taskState({ trash: trashIn() })] }),
  ])('masks an archived or trashed task', async (tasks) => {
    expect(await refusalOf(setup({ tasks }).useCase.execute(input()))).toEqual({
      reason: 'task-not-found',
    });
  });

  it.each([
    new InMemorySpaceDirectory({
      lists: atelierNordLists({ archivedAt: ARCHIVED_AT, archivedBy: HUGO_ACTOR }),
    }),
    new InMemorySpaceDirectory({ deletedLists: { [SPRINT_14]: HUGO_ACTOR } }),
    new InMemorySpaceDirectory({ deletedSpaces: { [PRODUIT]: HUGO_ACTOR } }),
  ])('masks an archived or deleted parent scope', async (spaces) => {
    expect(await refusalOf(setup({ spaces }).useCase.execute(input()))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('propagates an unavailable placement decision for the boundary to return 503', async () => {
    const spaces = new InMemorySpaceDirectory();
    const failure = new Error('The current placement is unavailable.');
    vi.spyOn(spaces, 'findVisibleList').mockRejectedValue(failure);
    await expect(setup({ spaces }).useCase.execute(input())).rejects.toBe(failure);
  });
});
