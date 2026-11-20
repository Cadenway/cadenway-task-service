import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_490,
  InMemorySpaceDirectory,
  InMemoryTasks,
  OTHER_ORGANIZATION,
  cad490State,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import { FindVisibleTaskLocations } from './find-visible-task-locations.use-case.js';

const viewer = { userId: 'camille', role: 'member' as const };

describe('finding visible task locations', () => {
  it('reads distinct ids and keys in one transaction and returns each visible task once', async () => {
    const store = new InMemoryTasks({ tasks: [taskState(), cad490State({ listId: BUGS })] });
    const spaces = new InMemorySpaceDirectory();
    const result = await new FindVisibleTaskLocations(store, spaces).execute({
      organizationId: ATELIER_NORD,
      viewer,
      taskIds: [CAD_482, CAD_482, 'invalid'],
      taskKeys: ['CAD-482', 'CAD-490', 'CAD-490', 'cad-490'],
    });

    expect(result.tasks.map((task) => task.key).sort()).toEqual(['CAD-482', 'CAD-490']);
    expect(store.runs).toBe(1);
    expect(store.trace).toEqual(['reader.locationsByIds', 'reader.locationsByKeys']);
  });

  it('leaves inaccessible, trashed and other-tenant tasks out', async () => {
    const store = new InMemoryTasks({
      tasks: [taskState({ trash: trashIn(), version: 13 }), cad490State({ listId: BUGS })],
    });
    const spaces = new InMemorySpaceDirectory();
    const useCase = new FindVisibleTaskLocations(store, spaces);
    const guest = { userId: 'camille', role: 'guest' as const };
    expect(
      await useCase.execute({
        organizationId: ATELIER_NORD,
        viewer: guest,
        taskIds: [CAD_482, CAD_490],
        taskKeys: ['CAD-490'],
      }),
    ).toEqual({ tasks: [] });
    expect(
      await useCase.execute({
        organizationId: OTHER_ORGANIZATION,
        viewer,
        taskIds: [CAD_490],
        taskKeys: ['CAD-490'],
      }),
    ).toEqual({ tasks: [] });
  });

  it('rejects more than 100 selectors before opening a transaction', async () => {
    const store = new InMemoryTasks();
    const useCase = new FindVisibleTaskLocations(store, new InMemorySpaceDirectory());
    await expect(
      useCase.execute({
        organizationId: ATELIER_NORD,
        viewer,
        taskIds: Array.from({ length: 100 }, () => CAD_482),
        taskKeys: ['CAD-482'],
      }),
    ).rejects.toThrow(RangeError);
    expect(store.runs).toBe(0);
  });
});
