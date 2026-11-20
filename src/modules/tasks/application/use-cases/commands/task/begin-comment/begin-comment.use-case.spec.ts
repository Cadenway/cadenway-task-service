import { describe, expect, it, vi } from 'vitest';
import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  atelierNordMembers,
  sprint14SharedWith,
  taskState,
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
});
