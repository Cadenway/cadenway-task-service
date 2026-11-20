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
