import { describe, expect, it } from 'vitest';

import { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { LockedSubtree } from '../../models/task/locked-subtree.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import {
  CAD_483,
  CAD_484,
  CAD_490,
  InMemoryTasks,
  archiveFrom,
  cad490State,
  subtaskState,
  taskState,
} from '../../use-cases/tasks.fixture.js';
import { TaskSubtreeLocker } from './task-subtree-locker.service.js';

/**
 * Locks the subtree of CAD-482 in a store.
 *
 * @param tasks - The fake store.
 * @param otherIds - The other tasks to lock.
 * @returns The locked subtree.
 */
async function lockCad482(
  tasks: InMemoryTasks,
  otherIds: readonly string[] = [],
): Promise<LockedSubtree> {
  return tasks.run((store: TasksStore): Promise<LockedSubtree> =>
    new TaskSubtreeLocker().lock(store, Task.restore(taskState()), otherIds),
  );
}

describe('TaskSubtreeLocker: the live descendants of a task, locked in id order', () => {
  it('locks the live descendants at every level and the other tasks asked for', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        taskState(),
        subtaskState(),
        subtaskState({
          id: CAD_484,
          key: TaskKey.of('CAD', 484),
          parentId: CAD_483,
          parentKey: TaskKey.of('CAD', 483),
        }),
        cad490State(),
      ],
    });

    const locked: LockedSubtree = await lockCad482(tasks, [CAD_490]);

    expect(locked.shape).toMatchObject({ descendantIds: [CAD_483, CAD_484], height: 3 });
    expect(locked.tasks.map((task: Task): string => task.snapshot.id).sort()).toEqual(
      [CAD_483, CAD_484, CAD_490].sort(),
    );
    expect(tasks.trace).toEqual(['tasks.lockByIds']);
  });

  it('locks the tasks without their checklists when asked, for an archive, and with them by default', async () => {
    const stored = (): InMemoryTasks =>
      new InMemoryTasks({
        tasks: [taskState(), cad490State({ checklist: taskState().checklist })],
      });

    const lean: LockedSubtree = await stored().run((store: TasksStore): Promise<LockedSubtree> =>
      new TaskSubtreeLocker().lock(store, Task.restore(taskState()), [CAD_490], false),
    );
    const full: LockedSubtree = await lockCad482(stored(), [CAD_490]);

    expect(lean.tasks.map((task: Task) => task.snapshot.checklist)).toEqual([[]]);
    expect(full.tasks.map((task: Task) => task.snapshot.checklist)).toEqual([
      taskState().checklist,
    ]);
  });

  it('leaves an archived subtask, and what hangs from it, out of the subtree', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        taskState(),
        subtaskState({ archive: archiveFrom(CAD_483), version: 2 }),
        subtaskState({
          id: CAD_484,
          key: TaskKey.of('CAD', 484),
          parentId: CAD_483,
          parentKey: TaskKey.of('CAD', 483),
          archive: archiveFrom(CAD_483),
          version: 2,
        }),
      ],
    });

    const locked: LockedSubtree = await lockCad482(tasks);

    expect(locked.shape).toMatchObject({ descendantIds: [], height: 1 });
    expect(locked.tasks).toEqual([]);
    expect(tasks.trace).not.toContain('tasks.lockByIds');
  });
});
