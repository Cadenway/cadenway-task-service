import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { describe, expect, it } from 'vitest';
import {
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  INES,
  InMemorySpaceDirectory,
  InMemoryTasks,
  atelierNordMembers,
  taskState,
} from '../../../tasks.fixture.js';
import { ListWatchers } from './list-watchers.use-case.js';

/** The task and caller to read. */
const input = {
  organizationId: ATELIER_NORD,
  actorUserId: CAMILLE,
  taskKey: 'CAD-482',
  after: null,
  limit: 1,
};

describe('list watchers', () => {
  it('reads defaults in a snapshot and pages in user-ID order', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        taskState({ createdBy: { type: 'user', id: CAMILLE }, assigneeIds: [CAMILLE, INES] }),
      ],
    });
    const useCase = new ListWatchers(tasks, atelierNordMembers(), new InMemorySpaceDirectory());
    const first = await useCase.execute(input);
    expect(first).toEqual({ userIds: [CAMILLE], next: CAMILLE, total: 2, callerFollows: true });
    expect(await useCase.execute({ ...input, after: first.next })).toEqual({
      userIds: [INES],
      next: null,
      total: 2,
      callerFollows: true,
    });
    expect(tasks.snapshotRuns).toBe(2);
  });

  it('filters a removed assignee from the defaults', async () => {
    const tasks = new InMemoryTasks({
      tasks: [taskState({ createdBy: { type: 'user', id: CAMILLE }, assigneeIds: [INES] })],
    });
    const page = await new ListWatchers(
      tasks,
      atelierNordMembers([INES]),
      new InMemorySpaceDirectory(),
    ).execute(input);
    expect(page).toEqual({ userIds: [CAMILLE], next: null, total: 1, callerFollows: true });
  });
  it('applies explicit opt-outs and follows to the default set', async () => {
    const tasks = new InMemoryTasks({
      tasks: [taskState({ createdBy: { type: 'user', id: CAMILLE }, assigneeIds: [INES] })],
    });
    const unit: TasksUnitOfWork = {
      run: (work) => tasks.run(work),
      runReadOnly: <TResult>(work: (store: TasksStore) => Promise<TResult>) =>
        tasks.runReadOnly(
          (store) =>
            work({
              ...store,
              watcherOverrides: {
                ...store.watcherOverrides,
                list: () =>
                  Promise.resolve([
                    { userId: INES, following: false },
                    { userId: HUGO, following: true },
                  ]),
              },
            }),
          { snapshot: true },
        ),
    };
    const page = await new ListWatchers(
      unit,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    ).execute({ ...input, limit: 100 });
    expect(page.userIds).toEqual([CAMILLE, HUGO].sort());
    expect(page.total).toBe(2);
  });
});
