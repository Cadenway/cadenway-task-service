import { describe, expect, it } from 'vitest';

import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import {
  ATELIER_NORD,
  CAD_482,
  CAD_483,
  CAD_484,
  CAD_490,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  LEA,
  NOW,
  archiveFrom,
  atelierNordMembers,
  cad490State,
  refusalOf,
  sprint14SharedWith,
  subtaskState,
  taskState,
} from '../../../tasks.fixture.js';
import type { ArchiveTaskInput } from './archive-task.input.js';
import { ArchiveTask } from './archive-task.use-case.js';

/** CAD-484, a subtask of CAD-483, itself a subtask of CAD-482. */
function grandchild(overrides: Partial<TaskState> = {}): TaskState {
  return subtaskState({
    id: CAD_484,
    key: TaskKey.of('CAD', 484),
    parentId: CAD_483,
    parentKey: TaskKey.of('CAD', 483),
    name: 'Libellé du bouton',
    ...overrides,
  });
}

/** CAD-482 with its subtask CAD-483 and its sub-subtask CAD-484, and CAD-490 beside them. */
function tree(): TaskState[] {
  return [taskState(), subtaskState(), grandchild(), cad490State()];
}

/**
 * Builds the archive of CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function archive(overrides: Partial<ArchiveTaskInput> = {}): ArchiveTaskInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    expectedVersions: null,
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord holding the given tasks.
 *
 * @param stored - The tasks.
 * @param spaces - The fake spaces.
 * @returns The fake store and the use case.
 */
function atelierNord(
  stored: readonly TaskState[] = tree(),
  spaces?: InMemorySpaceDirectory,
): { readonly tasks: InMemoryTasks; readonly useCase: ArchiveTask } {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ tasks: stored, trace });
  return {
    tasks,
    useCase: new ArchiveTask(
      tasks,
      atelierNordMembers([], trace),
      spaces ?? new InMemorySpaceDirectory({ trace }),
    ),
  };
}

const camille = { type: 'user', id: CAMILLE } as const;

describe('ArchiveTask: an archive takes the task and its live subtasks at every level', () => {
  it('archives the root and its descendants with one archive, each at its next version', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(archive());

    for (const [id, version] of [
      [CAD_482, 13],
      [CAD_483, 2],
      [CAD_484, 2],
    ] as const) {
      expect(tasks.stored(id)).toMatchObject({
        archive: { at: NOW, by: camille, rootId: CAD_482 },
        updatedAt: NOW,
        version,
      });
    }
    expect(tasks.stored(CAD_490).archive).toBeNull();
  });

  it('keeps the status, the list and the parent of every task, and records no activity', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(archive());

    expect(tasks.stored(CAD_484)).toMatchObject({
      status: 'todo',
      listId: taskState().listId,
      parentId: CAD_483,
    });
    expect(tasks.activity.size).toBe(0);
  });

  it('appends task.archived.v1 for each task, the root first, then by depth, with the key of the root', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(archive());

    expect(tasks.events).toEqual([
      {
        kind: 'archived',
        key: 'CAD-482',
        version: 13,
        rootKey: 'CAD-482',
        parentKey: null,
        actor: camille,
      },
      {
        kind: 'archived',
        key: 'CAD-483',
        version: 2,
        rootKey: 'CAD-482',
        parentKey: 'CAD-482',
        actor: camille,
      },
      {
        kind: 'archived',
        key: 'CAD-484',
        version: 2,
        rootKey: 'CAD-482',
        parentKey: 'CAD-483',
        actor: camille,
      },
    ]);
  });

  it('answers the root archived, with the subtasks archived with it as its counts', async () => {
    const { useCase } = atelierNord();

    const view = await useCase.execute(archive());

    expect(view).toMatchObject({
      key: 'CAD-482',
      version: 13,
      archivedAt: NOW,
      archivedBy: camille,
      subtaskCounts: { total: 1, closed: 0 },
    });
  });

  it('locks the actor, the task, then its live subtree, and writes the archive in one statement', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(archive());

    expect(tasks.trace.filter((call: string): boolean => !call.startsWith('spaces.'))).toEqual([
      `members.roleOf:${CAMILLE}:lock`,
      'tasks.findByKey:read',
      'tasks.findByKey:lock',
      'tasks.lockByIds',
      'tasks.writeArchives',
      'events.archived',
      'events.archived',
      'events.archived',
    ]);
  });

  it('archives a subtask alone: its parent stays live and counts one live subtask less', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(archive({ taskKey: 'CAD-483' }));

    expect(tasks.stored(CAD_483).archive).toEqual({ at: NOW, by: camille, rootId: CAD_483 });
    expect(tasks.stored(CAD_484).archive).toEqual({ at: NOW, by: camille, rootId: CAD_483 });
    expect(tasks.stored(CAD_482).archive).toBeNull();
    expect(tasks.events.map((event) => event.key)).toEqual(['CAD-483', 'CAD-484']);
  });
});

describe('ArchiveTask: a subtask archived before keeps its own archive', () => {
  it('leaves an archived subtask and what hangs from it out of the new archive', async () => {
    const older = archiveFrom(CAD_483);
    const { tasks, useCase } = atelierNord([
      taskState(),
      subtaskState({ archive: older, version: 2 }),
      grandchild({ archive: older, version: 2 }),
    ]);

    const view = await useCase.execute(archive());

    expect(tasks.stored(CAD_483)).toMatchObject({ archive: older, version: 2 });
    expect(tasks.stored(CAD_484)).toMatchObject({ archive: older, version: 2 });
    expect(tasks.events.map((event) => event.key)).toEqual(['CAD-482']);
    expect(view.subtaskCounts).toEqual({ total: 0, closed: 0 });
  });
});

describe('ArchiveTask: an archived task answers as it is', () => {
  it('answers the same version, writes and emits nothing', async () => {
    const { tasks, useCase } = atelierNord([taskState({ archive: archiveFrom(CAD_482) })]);

    const view = await useCase.execute(archive({ expectedVersions: [12] }));

    expect(view).toMatchObject({ version: 12, archivedAt: archiveFrom(CAD_482).at });
    expect(tasks.events).toEqual([]);
    expect(tasks.trace).not.toContain('tasks.writeArchives');
  });

  it('checks If-Match before answering that nothing changed', async () => {
    const { useCase } = atelierNord([taskState({ archive: archiveFrom(CAD_482) })]);

    expect(await refusalOf(useCase.execute(archive({ expectedVersions: [3] })))).toEqual({
      reason: 'version-mismatch',
      version: 12,
    });
  });
});

describe('ArchiveTask: the refusals, task-not-found, then role-insufficient, then If-Match', () => {
  it('refuses an unknown key and a task of a list the actor has no role on', async () => {
    const { useCase } = atelierNord(tree(), sprint14SharedWith({ [HUGO]: 'view' }));

    expect(await refusalOf(useCase.execute(archive({ taskKey: 'CAD-999' })))).toEqual({
      reason: 'task-not-found',
    });
    expect(await refusalOf(useCase.execute(archive({ actorUserId: LEA })))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses without edit on the list, before a stale If-Match, and writes nothing', async () => {
    const { tasks, useCase } = atelierNord(tree(), sprint14SharedWith({ [HUGO]: 'comment' }));

    expect(
      await refusalOf(useCase.execute(archive({ actorUserId: HUGO, expectedVersions: [3] }))),
    ).toEqual({ reason: 'role-insufficient', role: 'comment' });
    expect(tasks.stored(CAD_482).archive).toBeNull();
    expect(tasks.events).toEqual([]);
  });

  it('refuses a stale If-Match with the stored version', async () => {
    const { tasks, useCase } = atelierNord();

    expect(await refusalOf(useCase.execute(archive({ expectedVersions: [11] })))).toEqual({
      reason: 'version-mismatch',
      version: 12,
    });
    expect(tasks.stored(CAD_483).archive).toBeNull();
  });
});
