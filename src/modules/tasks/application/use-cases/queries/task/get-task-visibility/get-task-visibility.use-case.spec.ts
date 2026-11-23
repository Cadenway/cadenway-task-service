import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAMILLE,
  NADIA,
  InMemorySpaceDirectory,
  InMemoryTasks,
  STRANGER,
  archiveFrom,
  atelierNordMembers,
  cad490State,
  queryTask,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import { GetTaskVisibility } from './get-task-visibility.use-case.js';

describe('GetTaskVisibility', () => {
  it('returns visible keys in request order and includes archived tasks', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        taskState({ archive: archiveFrom(CAD_482) }),
        cad490State({ listId: BUGS }),
        queryTask(0, { trash: trashIn() }),
      ],
    });
    const result = await new GetTaskVisibility(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    ).execute({
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      taskKeys: ['CAD-490', 'CAD-800', 'CAD-482', 'CAD-999'],
    });

    expect(result).toEqual({ visibleTaskKeys: ['CAD-490', 'CAD-482'] });
    expect(tasks.trace).toEqual(['reader.locationsByKeys']);
    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(1);
  });

  it('omits tasks on lists the viewer cannot see', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState(), cad490State({ listId: BUGS })] });
    const result = await new GetTaskVisibility(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    ).execute({
      organizationId: ATELIER_NORD,
      actorUserId: NADIA,
      taskKeys: ['CAD-482', 'CAD-490'],
    });
    expect(result.visibleTaskKeys).toEqual([]);
  });

  it('refuses an unknown member before deciding task visibility', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const useCase = new GetTaskVisibility(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );
    await expect(
      useCase.execute({
        organizationId: ATELIER_NORD,
        actorUserId: STRANGER,
        taskKeys: ['CAD-482'],
      }),
    ).rejects.toMatchObject({ refusal: { reason: 'organization-not-found' } });
    expect(tasks.trace).toEqual([]);
  });

  it('rejects an empty, oversized or duplicate batch before reading', async () => {
    const tasks = new InMemoryTasks();
    const useCase = new GetTaskVisibility(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );
    const base = { organizationId: ATELIER_NORD, actorUserId: CAMILLE };
    for (const taskKeys of [[], Array(101).fill('CAD-482'), ['CAD-482', 'CAD-482']]) {
      await expect(useCase.execute({ ...base, taskKeys })).rejects.toThrow(RangeError);
    }
    expect(tasks.runs).toBe(0);
  });
});
