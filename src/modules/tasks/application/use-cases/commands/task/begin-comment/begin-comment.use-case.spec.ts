import { describe, expect, it, vi } from 'vitest';
import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  HUGO,
  INES,
  InMemorySpaceDirectory,
  InMemoryTasks,
  atelierNordMembers,
  placedList,
  placedSpace,
  sprint14SharedWith,
  storedEntry,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import { BeginComment } from './begin-comment.use-case.js';

/** Caller and task for a comment creation. */
const input = { organizationId: ATELIER_NORD, actorUserId: CAMILLE, taskKey: 'CAD-482' };

describe('begin comment', () => {
  it('locks and increments a visible editable task once', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const result = await new BeginComment(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    ).execute(input);
    expect(result).toMatchObject({ outcome: 'ready', taskId: CAD_482, version: 13 });
    expect(tasks.stored(CAD_482).version).toBe(13);
  });

  it('snapshots eligible effective watchers on creation and leaves removed accounts out', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const result = await new BeginComment(
      tasks,
      atelierNordMembers([INES]),
      new InMemorySpaceDirectory(),
    ).execute({ ...input, includeWatcherAudience: true });
    expect(result).toMatchObject({ outcome: 'ready', watcherIds: [CAMILLE] });
  });

  it('allows comment role and refuses view before changing the task', async () => {
    const viewTasks = new InMemoryTasks({ tasks: [taskState()] });
    const view = new BeginComment(
      viewTasks,
      atelierNordMembers(),
      sprint14SharedWith({ [HUGO]: 'view' }),
    );
    expect(await view.execute({ ...input, actorUserId: HUGO })).toEqual({
      outcome: 'role-insufficient',
      role: 'view',
    });
    expect(viewTasks.stored(CAD_482).version).toBe(12);
    const commentTasks = new InMemoryTasks({ tasks: [taskState()] });
    const permitted = new BeginComment(
      commentTasks,
      atelierNordMembers(),
      sprint14SharedWith({ [HUGO]: 'comment' }),
    );
    expect(await permitted.execute({ ...input, actorUserId: HUGO })).toMatchObject({
      outcome: 'ready',
      version: 13,
    });
  });

  it('requires effective edit for delegated creation and replay', async () => {
    const tasks = InMemoryTasks.withCad482();
    const begin = new BeginComment(
      tasks,
      atelierNordMembers(),
      sprint14SharedWith({ [HUGO]: 'comment' }),
    );
    const delegate = { ...input, actorUserId: HUGO };

    expect(await begin.execute({ ...delegate, requireEdit: true })).toEqual({
      outcome: 'role-insufficient',
      role: 'comment',
    });
    expect(await begin.authorize(delegate)).toBe(false);
    expect(tasks.stored(CAD_482).version).toBe(12);
  });

  it('holds membership, task and current placement without changing the version on replay', async () => {
    const trace: string[] = [];
    const tasks = InMemoryTasks.withCad482({ trace });
    const members = atelierNordMembers([], trace);
    const spaces = new InMemorySpaceDirectory({ trace });
    const begin = new BeginComment(tasks, members, spaces);

    expect(await begin.authorize(input)).toBe(true);
    expect(trace.indexOf(`members.roleOf:${CAMILLE}:lock`)).toBeLessThan(
      trace.indexOf('tasks.findByKey:lock'),
    );
    expect(trace.indexOf('tasks.findByKey:lock')).toBeLessThan(
      trace.indexOf('spaces.lockTrashLists'),
    );
    expect(trace.indexOf('spaces.lockTrashLists')).toBeLessThan(
      trace.lastIndexOf('spaces.findVisibleList'),
    );
    expect(tasks.stored(CAD_482).version).toBe(12);

    expect(
      await begin.execute({ ...input, requireEdit: true, includeWatcherAudience: true }),
    ).toMatchObject({ outcome: 'ready', version: 13, watcherIds: [CAMILLE, INES] });
  });

  it('refuses replay after the delegated author loses membership', async () => {
    const tasks = InMemoryTasks.withCad482();
    const begin = new BeginComment(
      tasks,
      atelierNordMembers([CAMILLE]),
      new InMemorySpaceDirectory(),
    );

    expect(await begin.authorize(input)).toBe(false);
    expect(tasks.stored(CAD_482).version).toBe(12);
  });

  it.each(['create', 'replay'] as const)(
    'refuses delegated %s if the parent list was archived before the placement lock',
    async (operation) => {
      const tasks = InMemoryTasks.withCad482();
      const spaces = new InMemorySpaceDirectory();
      vi.spyOn(spaces, 'findVisibleList').mockImplementation(() =>
        Promise.resolve({
          list: placedList({
            archivedAt:
              spaces.lockTrashCalls.length === 0 ? null : new Date('2026-11-10T00:00:00Z'),
          }),
          space: placedSpace(),
        }),
      );
      const begin = new BeginComment(tasks, atelierNordMembers(), spaces);

      if (operation === 'create') {
        expect(await begin.execute({ ...input, requireEdit: true })).toEqual({
          outcome: 'task-not-found',
        });
      } else {
        expect(await begin.authorize(input)).toBe(false);
      }
      expect(spaces.lockTrashCalls).toHaveLength(1);
      expect(tasks.stored(CAD_482).version).toBe(12);
    },
  );

  it('reports moderation authority only to an editor managing the current space', async () => {
    const tasks = InMemoryTasks.withCad482();
    const begin = new BeginComment(
      tasks,
      atelierNordMembers(),
      sprint14SharedWith({ [HUGO]: 'edit' }),
    );

    expect(await begin.execute({ ...input, includeModerationAuthority: true })).toMatchObject({
      outcome: 'ready',
      canModerateAutomationComment: true,
    });
    expect(
      await begin.execute({ ...input, actorUserId: HUGO, includeModerationAuthority: true }),
    ).toMatchObject({ outcome: 'ready', canModerateAutomationComment: false });
    expect(await begin.execute(input)).not.toHaveProperty('canModerateAutomationComment');
  });

  it('refuses view access before checking recipient memberships', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const members = atelierNordMembers();
    const roleOf = vi.spyOn(members, 'roleOf');
    const useCase = new BeginComment(tasks, members, sprint14SharedWith({ [HUGO]: 'view' }));

    expect(await useCase.execute({ ...input, actorUserId: HUGO, recipientIds: [INES] })).toEqual({
      outcome: 'role-insufficient',
      role: 'view',
    });
    expect(roleOf.mock.calls).toEqual([[ATELIER_NORD, HUGO, true]]);
  });
  it('preserves the task trash refusal without changing its version', async () => {
    const tasks = new InMemoryTasks({
      tasks: [taskState({ trash: trashIn() })],
      trashEntries: [storedEntry({ taskCount: 1 })],
    });
    const useCase = new BeginComment(tasks, atelierNordMembers(), new InMemorySpaceDirectory());
    expect(await useCase.execute(input)).toMatchObject({
      outcome: 'task-trashed',
      details: { key: 'CAD-482', rootKey: 'CAD-482', trashedBy: { type: 'user', id: CAMILLE } },
    });
    expect(tasks.stored(CAD_482).version).toBe(12);
  });
  it('holds recipient memberships and the task placement for the transaction', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const members = atelierNordMembers();
    const spaces = new InMemorySpaceDirectory();
    const roleOf = vi.spyOn(members, 'roleOf');
    const hold = vi.spyOn(spaces, 'lockTrashLists');
    await new BeginComment(tasks, members, spaces).execute({
      ...input,
      recipientIds: [HUGO, HUGO],
    });
    expect(roleOf).toHaveBeenCalledWith(ATELIER_NORD, CAMILLE, true);
    expect(roleOf).toHaveBeenCalledWith(ATELIER_NORD, HUGO, true);
    expect(roleOf).toHaveBeenCalledTimes(2);
    expect(hold).toHaveBeenCalledOnce();
    expect(roleOf.mock.invocationCallOrder[1]).toBeLessThan(hold.mock.invocationCallOrder[0] ?? 0);
  });

  it('restarts if a reply appears during preflight and holds its author before the task lock', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ tasks: [taskState()], trace });
    const members = atelierNordMembers([], trace);
    const spaces = new InMemorySpaceDirectory({ trace });
    const findReplyAuthor = vi
      .fn<(taskId: string) => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(HUGO);
    const result = await new BeginComment(tasks, members, spaces).execute({
      ...input,
      includeWatcherAudience: true,
      findReplyAuthor,
    });

    expect(result).toMatchObject({ outcome: 'ready', replyRecipientId: HUGO, version: 13 });
    expect(findReplyAuthor).toHaveBeenCalledTimes(4);
    expect(trace.indexOf(`members.roleOf:${HUGO}:lock`)).toBeGreaterThan(
      trace.indexOf('tasks.findByKey:lock'),
    );
    expect(trace.indexOf(`members.roleOf:${HUGO}:lock`)).toBeLessThan(
      trace.lastIndexOf('tasks.findByKey:lock'),
    );
    expect(trace.filter((entry) => entry === 'tasks.save')).toHaveLength(1);
  });
});
