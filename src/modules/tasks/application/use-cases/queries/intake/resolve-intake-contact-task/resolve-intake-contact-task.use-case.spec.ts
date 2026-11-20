import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  CAD_482_ENTRY,
  CAMILLE,
  HUGO,
  InMemoryTasks,
  STRANGER,
  archiveFrom,
  atelierNordMembers,
  sprint14SharedWith,
  storedEntry,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import { ResolveIntakeContactTask } from './resolve-intake-contact-task.use-case.js';

const target = { organizationId: ATELIER_NORD, actorUserId: CAMILLE, taskKey: 'CAD-482' };

describe('ResolveIntakeContactTask', () => {
  it('returns the stable id for an editor, including on an archived task', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ archive: archiveFrom(CAD_482) })] });
    const resolve = new ResolveIntakeContactTask(
      tasks,
      atelierNordMembers(),
      sprint14SharedWith({}),
    );
    expect(await resolve.execute(target)).toEqual({ outcome: 'found', taskId: CAD_482 });
  });

  it('refuses a visible non-editor and hides the id from a missing member', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const resolve = new ResolveIntakeContactTask(
      tasks,
      atelierNordMembers(),
      sprint14SharedWith({ [HUGO]: 'comment' }),
    );
    expect(await resolve.execute({ ...target, actorUserId: HUGO })).toEqual({
      outcome: 'role-insufficient',
      role: 'comment',
    });
    expect(await resolve.execute({ ...target, actorUserId: STRANGER })).toEqual({
      outcome: 'organization-not-found',
    });
    expect(await resolve.execute({ ...target, taskKey: 'CAD-999' })).toEqual({
      outcome: 'task-not-found',
    });
  });

  it('returns trash details only to an eligible editor', async () => {
    const entry = storedEntry({ taskCount: 1 });
    const task = taskState({ trash: trashIn() });
    const tasks = new InMemoryTasks({ tasks: [task], trashEntries: [entry] });
    const resolve = new ResolveIntakeContactTask(
      tasks,
      atelierNordMembers(),
      sprint14SharedWith({ [HUGO]: 'comment' }),
    );
    expect(await resolve.execute(target)).toEqual({
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
