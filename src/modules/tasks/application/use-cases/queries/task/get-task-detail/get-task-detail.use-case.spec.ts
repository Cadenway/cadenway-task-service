import { describe, expect, it } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import {
  ATELIER_NORD,
  CAD_483,
  CAMILLE,
  DESIGN,
  InMemorySpaceDirectory,
  InMemoryTasks,
  MAQUETTES,
  NADIA,
  PRODUIT,
  SPRINT_14,
  atelierNordMembers,
  refusalOf,
  sprint14SharedWith,
  subtaskState,
  taskState,
  archiveFrom,
  CAD_482,
  CAD_484,
  ARCHIVED_AT,
  HUGO_ACTOR,
} from '../../../tasks.fixture.js';
import type { GetTaskDetailInput } from './get-task-detail.input.js';
import { GetTaskDetail } from './get-task-detail.use-case.js';

/**
 * Builds the reading of the detail of CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<GetTaskDetailInput> = {}): GetTaskDetailInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord holding the given tasks.
 *
 * @param stored - The tasks.
 * @returns The use case.
 */
function atelierNord(stored = [taskState(), subtaskState()]): GetTaskDetail {
  return new GetTaskDetail(
    new InMemoryTasks({ tasks: stored }),
    atelierNordMembers(),
    new InMemorySpaceDirectory(),
  );
}

describe('GetTaskDetail: the task with where it is, its parent and its subtasks', () => {
  it('reads the task, its space and its list, and the summaries of its subtasks', async () => {
    const detail = await atelierNord().execute(read());

    expect(detail.task).toMatchObject({ key: 'CAD-482', version: 12 });
    expect(detail.space).toMatchObject({ id: PRODUIT, prefix: 'CAD', nextKey: 'CAD-496' });
    expect(detail.list).toMatchObject({ id: SPRINT_14, name: 'Sprint 14' });
    expect(detail.parent).toBeNull();
    expect(detail.subtasks).toEqual([
      expect.objectContaining({
        id: CAD_483,
        key: 'CAD-483',
        name: 'Ajouter le bouton SSO',
        parentKey: 'CAD-482',
        subtaskCounts: { total: 0, closed: 0 },
        checklistCounts: { total: 0, done: 0 },
      }),
    ]);
    expect(detail.subtasks[0]).not.toHaveProperty('description');
    expect(detail.subtasks[0]).not.toHaveProperty('checklist');
  });

  it('names the parent of a subtask with its name and status as they are now', async () => {
    const detail = await atelierNord().execute(read({ taskKey: 'CAD-483' }));

    expect(detail.parent).toEqual({
      key: 'CAD-482',
      name: 'Refondre l’écran de connexion SSO',
      status: 'progress',
    });
    expect(detail.task.parentKey).toBe('CAD-482');
    expect(detail.subtasks).toEqual([]);
  });

  it('shows the statuses of the space, hidden or not', async () => {
    const detail = await atelierNord().execute(read());

    expect(detail.space.statuses.todo).toEqual({ name: null, hidden: false });
  });
});

describe('GetTaskDetail: what the actor does not see is not found', () => {
  it('refuses an unknown task', async () => {
    expect(await refusalOf(atelierNord().execute(read({ taskKey: 'CAD-999' })))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses a task of no list shared with a guest', async () => {
    expect(await refusalOf(atelierNord().execute(read({ actorUserId: NADIA })))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('shows a guest the task of a list shared with them, with their role on the list and none on the space', async () => {
    const detail = await new GetTaskDetail(
      new InMemoryTasks({ tasks: [taskState(), subtaskState()] }),
      atelierNordMembers(),
      sprint14SharedWith({ [NADIA]: 'view' }),
    ).execute(read({ actorUserId: NADIA }));

    expect(detail.list).toMatchObject({
      id: SPRINT_14,
      organizationAccess: false,
      callerRole: 'view',
    });
    expect(detail.space).toMatchObject({ id: PRODUIT, callerRole: null, callerCanManage: false });
  });

  it('gives the owner of the organization edit on the list and the management of the space', async () => {
    const detail = await atelierNord().execute(read());

    expect(detail.list.callerRole).toBe('edit');
    expect(detail.space).toMatchObject({ callerRole: 'edit', callerCanManage: true });
  });

  it('refuses a task of the private space of another member', async () => {
    const useCase = atelierNord([taskState({ listId: MAQUETTES, spaceId: DESIGN })]);

    expect(await refusalOf(useCase.execute(read()))).toEqual({ reason: 'task-not-found' });
  });
});

describe('GetTaskDetail: the read runs in one read-only transaction', () => {
  it('opens a single read-only run, with one snapshot (repeatable read), so its statements agree with each other', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });

    await new GetTaskDetail(tasks, atelierNordMembers(), new InMemorySpaceDirectory()).execute(
      read(),
    );

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(1);
  });
});

describe('GetTaskDetail: the subtasks of the detail are those of the archive of the task', () => {
  /**
   * Reads the detail of CAD-482 in a store.
   *
   * @param tasks - The fake store.
   * @returns The detail.
   */
  async function detailOf482(tasks: InMemoryTasks): ReturnType<GetTaskDetail['execute']> {
    return new GetTaskDetail(tasks, atelierNordMembers(), new InMemorySpaceDirectory()).execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      taskKey: 'CAD-482',
    });
  }

  it('shows the live subtasks of a live task', async () => {
    const detail = await detailOf482(
      new InMemoryTasks({
        tasks: [
          taskState(),
          subtaskState(),
          subtaskState({
            id: CAD_484,
            key: TaskKey.of('CAD', 484),
            archive: archiveFrom(CAD_484),
            version: 2,
          }),
        ],
      }),
    );

    expect(detail.subtasks.map((item) => item.key)).toEqual(['CAD-483']);
    expect(detail.task.subtaskCounts.total).toBe(1);
  });

  it('shows an archived task with its archive and the subtasks archived with it', async () => {
    const detail = await detailOf482(
      new InMemoryTasks({
        tasks: [
          taskState({ archive: archiveFrom(CAD_482), version: 13 }),
          subtaskState({ archive: archiveFrom(CAD_482), version: 2 }),
          subtaskState({
            id: CAD_484,
            key: TaskKey.of('CAD', 484),
            archive: archiveFrom(CAD_484),
            version: 2,
          }),
        ],
      }),
    );

    expect(detail.task).toMatchObject({
      archivedAt: ARCHIVED_AT,
      archivedBy: HUGO_ACTOR,
      subtaskCounts: { total: 1, closed: 0 },
    });
    expect(detail.subtasks.map((item) => item.key)).toEqual(['CAD-483']);
  });
});
