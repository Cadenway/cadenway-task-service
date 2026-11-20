import { describe, expect, it } from 'vitest';
import {
  ATELIER_NORD,
  CAD_482_ENTRY,
  CAMILLE,
  HUGO,
  InMemoryTasks,
  atelierNordMembers,
  sprint14SharedWith,
  storedEntry,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import { ResolveCommentTask } from './resolve-comment-task.use-case.js';

describe('resolve comment task', () => {
  it('returns the detailed trash refusal only to a viewer eligible to restore it', async () => {
    const entry = storedEntry({ taskCount: 1 });
    const task = taskState({ trash: trashIn() });
    const tasks = new InMemoryTasks({ tasks: [task], trashEntries: [entry] });
    const spaces = sprint14SharedWith({ [HUGO]: 'comment' });
    const resolve = new ResolveCommentTask(tasks, atelierNordMembers(), spaces);
    const target = { organizationId: ATELIER_NORD, taskKey: 'CAD-482' };

    expect(await resolve.execute({ ...target, actorUserId: CAMILLE })).toEqual({
      outcome: 'task-trashed',
      details: {
        key: 'CAD-482',
        name: task.name,
        entryId: CAD_482_ENTRY,
        rootKey: 'CAD-482',
        trashedAt: entry.trashedAt.toISOString(),
        trashedBy: { type: 'user', id: CAMILLE },
        purgeAt: new Date(entry.trashedAt.getTime() + 30 * 86_400_000).toISOString(),
      },
    });
    expect(await resolve.execute({ ...target, actorUserId: HUGO })).toEqual({
      outcome: 'task-not-found',
    });
  });
});
