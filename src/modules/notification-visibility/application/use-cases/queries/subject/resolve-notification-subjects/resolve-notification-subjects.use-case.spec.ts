import { describe, expect, it, vi } from 'vitest';

import { ResolveNotificationSubjects } from './resolve-notification-subjects.use-case.js';

describe('ResolveNotificationSubjects', () => {
  it('checks membership first and skips all resource reads without an active member', async () => {
    const noLookup = vi.fn<() => never>();
    const run = new ResolveNotificationSubjects((work) => work(), {
      findMember: () => Promise.resolve(null),
      findTasks: noLookup,
      findLists: noLookup,
      findSpaces: noLookup,
      findComments: noLookup,
    });
    expect(
      await run.execute({
        organizationId: 'tenant',
        userId: 'viewer',
        subjects: [{ kind: 'space', reference: 'space' }],
      }),
    ).toBeNull();
    expect(noLookup).not.toHaveBeenCalled();
  });

  it('keeps results in input order and reads comments only on visible tasks', async () => {
    const task = {
      id: '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1a23',
      key: 'CAD-482',
      name: 'Check the release',
      status: 'done',
      listId: 'list',
      spaceId: 'space',
    };
    const live = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
    const removed = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02';
    const comments = vi.fn(() =>
      Promise.resolve([{ taskId: task.id, commentId: live, excerpt: 'Current' }]),
    );
    const run = new ResolveNotificationSubjects((work) => work(), {
      findMember: () => Promise.resolve({ role: 'guest' }),
      findTasks: () => Promise.resolve({ tasks: [task] }),
      findLists: () => Promise.resolve({ lists: [] }),
      findSpaces: () => Promise.resolve([{ id: 'space', name: 'Test space' }]),
      findComments: comments,
    });
    const display = { taskId: task.id, taskKey: task.key, taskName: task.name };

    expect(
      await run.execute({
        organizationId: 'tenant',
        userId: 'viewer',
        subjects: [
          { kind: 'task-key', reference: 'CAD-404', display: { commentId: live } },
          { kind: 'space', reference: 'space' },
          {
            kind: 'task-id',
            reference: task.id.toUpperCase(),
            display: { commentId: live.toUpperCase() },
          },
          { kind: 'list', reference: 'hidden-list' },
          { kind: 'task-key', reference: task.key, display: { commentId: removed } },
          { kind: 'task-key', reference: task.key },
        ],
      }),
    ).toEqual([
      { visible: false },
      { visible: true },
      { visible: true, display: { ...display, commentExcerpt: 'Current' } },
      { visible: false },
      { visible: true, display: { ...display, commentExcerpt: null } },
      { visible: true },
    ]);
    expect(comments).toHaveBeenCalledExactlyOnceWith({
      organizationId: 'tenant',
      pairs: [
        { taskId: task.id, commentId: live.toUpperCase() },
        { taskId: task.id, commentId: removed },
      ],
    });
  });
});
