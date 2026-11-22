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
  atelierNordLists,
  CAD_482_ENTRY,
  NOW,
  SPRINT_14,
  TRASHED_AT,
  refusalOf,
  sprint14SharedWith,
  storedEntry,
  taskState,
  trashIn,
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

  it('checks current edit access under the task and placement locks before revealing the version', async () => {
    const trace: string[] = [];
    const tasks = InMemoryTasks.withCad482({ trace });
    const spaces = new InMemorySpaceDirectory({ trace });
    spaces.revokedUnderLock.add(SPRINT_14);

    const refusal = await refusalOf(locate(spaces, request({ expectedVersions: [3] }), tasks));

    expect(refusal).toEqual({ reason: 'task-not-found' });
    expect(trace).toEqual([
      'tasks.findByKey:read',
      'spaces.findVisibleList',
      'tasks.findByKey:lock',
      'spaces.lockTrashLists',
    ]);
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

describe('TaskLocator: a task in the trash answers task-trashed to whoever could change its list', () => {
  /** The refusal of CAD-482 in the trash, with its entry. */
  const trashed = {
    reason: 'task-trashed',
    key: 'CAD-482',
    name: 'Refondre l’écran de connexion SSO',
    entryId: CAD_482_ENTRY,
    rootKey: 'CAD-482',
    trashedAt: TRASHED_AT,
    trashedBy: { type: 'user', id: CAMILLE },
    purgeAt: new Date('2026-12-06T16:20:00.000Z'),
  } as const;

  /**
   * A store holding CAD-482 in the trash, in its entry.
   *
   * @param entry - What replaces the entry.
   * @returns The fake store.
   */
  function inTrash(entry: Parameters<typeof storedEntry>[0] = {}): InMemoryTasks {
    return new InMemoryTasks({
      tasks: [taskState({ trash: trashIn(), version: 13 })],
      trashEntries: [storedEntry({ taskCount: 1, ...entry })],
    });
  }

  it.each([
    ['a read', { edit: false, lock: false }],
    ['a write', {}],
  ] as const)(
    'answers %s with the entry when the actor has edit on the list',
    async (_case, overrides) => {
      expect(
        await refusalOf(locate(new InMemorySpaceDirectory(), request(overrides), inTrash())),
      ).toEqual(trashed);
    },
  );

  it.each(['view', 'comment'] as const)(
    'answers task-not-found to an actor with %s on the list, before the role a change needs',
    async (role) => {
      expect(
        await refusalOf(locate(sprint14SharedWith({ [HUGO]: role }), request(), inTrash())),
      ).toEqual({ reason: 'task-not-found' });
    },
  );

  it('answers task-not-found to an actor with no role on the list', async () => {
    expect(
      await refusalOf(
        locate(sprint14SharedWith({}), request({ edit: false, lock: false }), inTrash()),
      ),
    ).toEqual({ reason: 'task-not-found' });
  });

  it.each(['refuse', 'allow'] as const)(
    'answers an archived task in the trash task-trashed first, archives %s',
    async (archived) => {
      const tasks = new InMemoryTasks({
        tasks: [taskState({ trash: trashIn(), archive: archiveFrom(CAD_482), version: 13 })],
        trashEntries: [storedEntry({ taskCount: 1 })],
      });

      expect(
        await refusalOf(locate(new InMemorySpaceDirectory(), request({ archived }), tasks)),
      ).toEqual(trashed);
    },
  );

  it('decides on the role the actor would have on a deleted list, as if it were not deleted', async () => {
    const deleted = new InMemorySpaceDirectory({
      deletedLists: { [SPRINT_14]: { type: 'user', id: CAMILLE } },
    });
    const guestOnly = new InMemorySpaceDirectory({
      lists: atelierNordLists({ organizationAccess: false }),
      listGrants: { [SPRINT_14]: { [NADIA]: 'view' } },
      deletedLists: { [SPRINT_14]: { type: 'user', id: CAMILLE } },
    });

    expect(await refusalOf(locate(deleted, request(), inTrash()))).toEqual(trashed);
    expect(
      await refusalOf(
        locate(guestOnly, request({ viewer: { userId: NADIA, role: 'guest' } }), inTrash()),
      ),
    ).toEqual({ reason: 'task-not-found' });
  });

  it('answers task-not-found once "Vider la corbeille" handed the entry to the purge', async () => {
    const handedOver: InMemoryTasks = inTrash({
      purgeRequest: { at: NOW, by: { type: 'user', id: CAMILLE } },
    });

    expect(await refusalOf(locate(new InMemorySpaceDirectory(), request(), handedOver))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('answers task-not-found for a live task of a deleted list, which nobody sees', async () => {
    const deleted = new InMemorySpaceDirectory({
      deletedLists: { [SPRINT_14]: { type: 'user', id: CAMILLE } },
    });

    expect(await refusalOf(locate(deleted, request({ edit: false, lock: false })))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('decides on the locked task, deleted while the write waited for its lock', async () => {
    const tasks = new InMemoryTasks({
      tasks: [taskState()],
      trashEntries: [storedEntry({ taskCount: 1 })],
    });

    const refusal = await refusalOf(
      tasks.run((store: TasksStore): Promise<LocatedTask> => {
        const trashedMeanwhile: TasksStore = {
          ...store,
          tasks: {
            ...store.tasks,
            findByKey: (organizationId: string, key: TaskKey, lock: boolean) =>
              lock
                ? Promise.resolve(Task.restore(taskState({ trash: trashIn(), version: 13 })))
                : store.tasks.findByKey(organizationId, key, lock),
          },
        };
        return new TaskLocator(new InMemorySpaceDirectory()).locate(trashedMeanwhile, request());
      }),
    );

    expect(refusal).toEqual(trashed);
  });
});

describe('TaskLocator.confirm: the checks of the unlocked read are made again on the task as locked', () => {
  /**
   * Locates CAD-482 without a lock, then confirms it on a locked copy.
   *
   * @param spaces - The fake spaces.
   * @param locked - The task as the lock read it.
   * @param overrides - Fields of the request to replace.
   * @param tasks - The fake store.
   * @returns What `confirm` answered.
   */
  async function confirm(
    spaces: InMemorySpaceDirectory,
    locked: Task,
    overrides: Partial<LocateRequest> = {},
    tasks: InMemoryTasks = InMemoryTasks.withCad482(),
  ): Promise<LocatedTask> {
    const unlocked: LocateRequest = request({ lock: false, ...overrides });
    return tasks.run(async (store: TasksStore): Promise<LocatedTask> => {
      const locator = new TaskLocator(spaces);
      await locator.locate(store, unlocked);
      return locator.confirm(store, unlocked, locked);
    });
  }

  it('reads the placement again for the locked task even when its list is unchanged', async () => {
    const trace: string[] = [];
    const spaces = new InMemorySpaceDirectory({ trace });

    const { task, placement } = await confirm(
      spaces,
      Task.restore(taskState()),
      {},
      InMemoryTasks.withCad482({ trace }),
    );

    expect(task.snapshot.version).toBe(12);
    expect(placement.list.id).toBe(SPRINT_14);
    expect(trace.filter((call: string): boolean => call === 'spaces.findVisibleList')).toHaveLength(
      2,
    );
  });

  it('decides on the list of the locked task when it moved meanwhile: a list seen only refuses', async () => {
    const tasks = InMemoryTasks.withCad482({ tasks: [taskState({ listId: BUGS })] });

    expect(
      await refusalOf(
        confirm(
          sprint14SharedWith({ [HUGO]: 'view' }),
          Task.restore(taskState({ version: 13 })),
          {},
          tasks,
        ),
      ),
    ).toEqual({ reason: 'role-insufficient', role: 'view' });
  });

  it('refuses a task archived meanwhile as task-archived, unless the caller lets archived tasks through', async () => {
    const archived: Task = Task.restore(taskState({ archive: archiveFrom(CAD_482), version: 13 }));
    const spaces = new InMemorySpaceDirectory();

    expect(await refusalOf(confirm(spaces, archived))).toEqual({
      reason: 'task-archived',
      key: 'CAD-482',
    });
    expect((await confirm(spaces, archived, { archived: 'allow' })).task.snapshot.version).toBe(13);
  });

  it('checks If-Match on the locked version, which a change committed meanwhile moved on', async () => {
    expect(
      await refusalOf(
        confirm(new InMemorySpaceDirectory(), Task.restore(taskState({ version: 13 })), {
          expectedVersions: [12],
        }),
      ),
    ).toEqual({ reason: 'version-mismatch', version: 13 });
  });

  it('answers task-trashed for a task the lock reads in the trash', async () => {
    const tasks = InMemoryTasks.withCad482({ trashEntries: [storedEntry({ taskCount: 1 })] });

    expect(
      await refusalOf(
        confirm(
          new InMemorySpaceDirectory(),
          Task.restore(taskState({ trash: trashIn(), version: 13 })),
          {},
          tasks,
        ),
      ),
    ).toMatchObject({ reason: 'task-trashed', key: 'CAD-482', entryId: CAD_482_ENTRY });
  });
});
