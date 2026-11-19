import { describe, expect, it } from 'vitest';

import { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { LocateRequest } from '../../models/task/locate-request.model.js';
import type { LocatedTask } from '../../models/task/located-task.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  LEA,
  NADIA,
  archiveFrom,
  refusalOf,
  sprint14SharedWith,
  taskState,
} from '../../use-cases/tasks.fixture.js';
import { TaskLocator } from './task-locator.service.js';

/** Hugo Dubois, a member of Atelier Nord. */
const HUGO_MEMBER: Viewer = { userId: HUGO, role: 'member' };

/**
 * Builds a request for CAD-482 by Hugo Dubois.
 *
 * @param overrides - Fields to replace.
 * @returns The request.
 */
function request(overrides: Partial<LocateRequest> = {}): LocateRequest {
  return {
    organizationId: ATELIER_NORD,
    viewer: HUGO_MEMBER,
    taskKey: 'CAD-482',
    edit: true,
    lock: true,
    archived: 'refuse',
    expectedVersions: null,
    ...overrides,
  };
}

/**
 * Locates CAD-482 in a store holding it, over some spaces.
 *
 * @param spaces - The fake spaces.
 * @param located - The request.
 * @param tasks - The fake store.
 * @returns What the locator found.
 */
async function locate(
  spaces: InMemorySpaceDirectory,
  located: LocateRequest,
  tasks: InMemoryTasks = InMemoryTasks.withCad482(),
): Promise<LocatedTask> {
  return tasks.run((store: TasksStore): Promise<LocatedTask> =>
    new TaskLocator(spaces).locate(store, located),
  );
}

describe('TaskLocator: a read needs any role on the list of the task', () => {
  it.each(['view', 'comment', 'edit'] as const)(
    'finds CAD-482 for a member with %s on Sprint 14',
    async (role) => {
      const { task, placement } = await locate(
        sprint14SharedWith({ [HUGO]: role }),
        request({ edit: false, lock: false }),
      );

      expect(task.snapshot.key.format()).toBe('CAD-482');
      expect(placement.list.callerRole).toBe(role);
    },
  );

  it('finds it for a guest the list is shared with', async () => {
    const { placement } = await locate(
      sprint14SharedWith({ [NADIA]: 'view' }),
      request({ viewer: { userId: NADIA, role: 'guest' }, edit: false, lock: false }),
    );

    expect(placement.list).toMatchObject({ id: taskState().listId, callerRole: 'view' });
    expect(placement.space.callerRole).toBeNull();
  });

  it('refuses a member without a role on the list as task-not-found, like an unknown task', async () => {
    const spaces = sprint14SharedWith({ [HUGO]: 'view' });

    expect(
      await refusalOf(
        locate(spaces, request({ viewer: { userId: LEA, role: 'member' }, edit: false })),
      ),
    ).toEqual({ reason: 'task-not-found' });
    expect(await refusalOf(locate(spaces, request({ taskKey: 'CAD-999', edit: false })))).toEqual({
      reason: 'task-not-found',
    });
  });
});

describe('TaskLocator: a change needs edit on the list of the task', () => {
  it.each(['view', 'comment'] as const)(
    'refuses a member with %s as role-insufficient, naming the role, before locking',
    async (role) => {
      const tasks = InMemoryTasks.withCad482();

      expect(
        await refusalOf(locate(sprint14SharedWith({ [HUGO]: role }), request(), tasks)),
      ).toEqual({ reason: 'role-insufficient', role });
      expect(tasks.trace).not.toContain('tasks.findByKey:lock');
    },
  );

  it('answers task-not-found before role-insufficient for a list the actor has no role on', async () => {
    expect(
      await refusalOf(
        locate(sprint14SharedWith({}), request({ viewer: { userId: LEA, role: 'member' } })),
      ),
    ).toEqual({ reason: 'task-not-found' });
  });

  it('answers role-insufficient before version-mismatch', async () => {
    expect(
      await refusalOf(
        locate(sprint14SharedWith({ [HUGO]: 'comment' }), request({ expectedVersions: [3] })),
      ),
    ).toEqual({ reason: 'role-insufficient', role: 'comment' });
  });

  it('checks If-Match once the role allows the change', async () => {
    expect(
      await refusalOf(
        locate(sprint14SharedWith({ [HUGO]: 'edit' }), request({ expectedVersions: [3] })),
      ),
    ).toEqual({ reason: 'version-mismatch', version: 12 });
  });

  it('lets a guest with edit on the list change its tasks', async () => {
    const { task } = await locate(
      sprint14SharedWith({ [NADIA]: 'edit' }),
      request({ viewer: { userId: NADIA, role: 'guest' } }),
    );

    expect(task.snapshot.version).toBe(12);
  });

  it('lets every member change the tasks of a list of the organization, the rule before grants', async () => {
    const { placement } = await locate(new InMemorySpaceDirectory(), request());

    expect(placement.list.callerRole).toBe('edit');
  });

  it('decides on the list the locked task is in when a move committed meanwhile', async () => {
    const tasks = InMemoryTasks.withCad482({ tasks: [taskState({ listId: BUGS })] });
    const spaces = sprint14SharedWith({ [HUGO]: 'view' });

    const refusal = await refusalOf(
      tasks.run((store: TasksStore): Promise<LocatedTask> => {
        const moved: TasksStore = {
          ...store,
          tasks: {
            ...store.tasks,
            findByKey: (organizationId: string, key: TaskKey, lock: boolean) =>
              lock
                ? Promise.resolve(Task.restore(taskState()))
                : store.tasks.findByKey(organizationId, key, lock),
          },
        };
        return new TaskLocator(spaces).locate(moved, request());
      }),
    );

    expect(refusal).toEqual({ reason: 'role-insufficient', role: 'view' });
  });

  it('keeps the owner of the space at edit whatever the grants', async () => {
    const { placement } = await locate(
      sprint14SharedWith({}),
      request({ viewer: { userId: CAMILLE, role: 'owner' } }),
    );

    expect(placement.list.callerRole).toBe('edit');
  });
});

describe('TaskLocator: a change of an archived task answers task-archived', () => {
  const archived = (): InMemoryTasks =>
    InMemoryTasks.withCad482({ tasks: [taskState({ archive: archiveFrom(CAD_482) })] });

  it('refuses a change of an archived task with its key, after the role and before If-Match', async () => {
    expect(
      await refusalOf(
        locate(
          sprint14SharedWith({ [HUGO]: 'edit' }),
          request({ expectedVersions: [3] }),
          archived(),
        ),
      ),
    ).toEqual({ reason: 'task-archived', key: 'CAD-482' });
  });

  it('answers task-not-found, then role-insufficient, before task-archived', async () => {
    expect(
      await refusalOf(
        locate(
          sprint14SharedWith({}),
          request({ viewer: { userId: LEA, role: 'member' } }),
          archived(),
        ),
      ),
    ).toEqual({ reason: 'task-not-found' });
    expect(
      await refusalOf(locate(sprint14SharedWith({ [HUGO]: 'view' }), request(), archived())),
    ).toEqual({ reason: 'role-insufficient', role: 'view' });
  });

  it('lets a read, the archive and the restoration find an archived task', async () => {
    const { task } = await locate(
      new InMemorySpaceDirectory(),
      request({ archived: 'allow', expectedVersions: [12] }),
      archived(),
    );

    expect(task.snapshot.archive).toEqual(archiveFrom(CAD_482));
  });

  it('decides on the locked task, archived while the write waited for its lock', async () => {
    const tasks = InMemoryTasks.withCad482();

    const refusal = await refusalOf(
      tasks.run((store: TasksStore): Promise<LocatedTask> => {
        const archivedMeanwhile: TasksStore = {
          ...store,
          tasks: {
            ...store.tasks,
            findByKey: (organizationId: string, key: TaskKey, lock: boolean) =>
              lock
                ? Promise.resolve(Task.restore(taskState({ archive: archiveFrom(CAD_482) })))
                : store.tasks.findByKey(organizationId, key, lock),
          },
        };
        return new TaskLocator(new InMemorySpaceDirectory()).locate(archivedMeanwhile, request());
      }),
    );

    expect(refusal).toEqual({ reason: 'task-archived', key: 'CAD-482' });
  });
});
