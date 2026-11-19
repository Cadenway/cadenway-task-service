import { describe, expect, it } from 'vitest';

import { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import {
  ATELIER_NORD,
  CAD_482,
  CAD_483,
  CAD_490,
  InMemoryTasks,
  archiveFrom,
  cad490State,
  subtaskState,
  taskState,
  trashIn,
} from '../../use-cases/tasks.fixture.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { LockedTrashTrees } from '../../models/trash/locked-trash-trees.model.js';
import type { TrashTree } from '../../models/trash/trash-tree.model.js';
import { TrashTreeLocker } from './trash-tree-locker.service.js';

/**
 * Locks trees in one unit of work of a fake store.
 *
 * @param tasks - The fake store.
 * @param rootIds - The roots.
 * @param held - The tasks the caller holds.
 * @param maxTasks - The bound of the batch.
 * @returns What was locked.
 */
async function lock(
  tasks: InMemoryTasks,
  rootIds: readonly string[],
  held: readonly Task[] = [],
  maxTasks: number = Number.POSITIVE_INFINITY,
): Promise<LockedTrashTrees> {
  return tasks.run((store: TasksStore): Promise<LockedTrashTrees> =>
    new TrashTreeLocker().lock(store, ATELIER_NORD, rootIds, held, maxTasks),
  );
}

/**
 * Lists the ids of the members of each tree.
 *
 * @param trees - The trees.
 * @returns The ids, by tree.
 */
function membersOf(trees: readonly TrashTree[]): readonly (readonly string[])[] {
  return trees.map((tree: TrashTree): readonly string[] =>
    tree.members.map((member: Task): string => member.snapshot.id),
  );
}

describe('TrashTreeLocker: the trees of trash entries, read and locked in one statement each', () => {
  it('locks each root with every descendant of its list out of the trash, archived ones included', async () => {
    const tasks = new InMemoryTasks({
      tasks: [
        taskState(),
        subtaskState({ archive: archiveFrom(CAD_483), version: 2 }),
        cad490State(),
      ],
    });

    const locked = await lock(tasks, [CAD_482, CAD_490]);

    expect(locked.examined).toEqual([CAD_482, CAD_490]);
    expect(membersOf(locked.trees)).toEqual([[CAD_482, CAD_483], [CAD_490]]);
    expect(locked.trees[0]?.root.snapshot.id).toBe(CAD_482);
    expect(tasks.trace).toEqual(['tasks.trashTrees', 'tasks.lockByIds', 'tasks.trashTrees']);
  });

  it('takes the roots in their order until their trees reach the bound, the first always', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState(), subtaskState(), cad490State()] });

    const locked = await lock(tasks, [CAD_482, CAD_490], [], 1);

    expect(locked.examined).toEqual([CAD_482]);
    expect(membersOf(locked.trees)).toEqual([[CAD_482, CAD_483]]);
  });

  it('keeps a task the caller holds locked as it is and locks only the others', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState(), subtaskState()] });
    const root: Task = Task.restore(taskState());

    const locked = await lock(tasks, [CAD_482], [root]);

    expect(locked.trees[0]?.root).toBe(root);
    expect(locked.trees[0]?.members[0]).toBe(root);
    expect(locked.trees[0]?.members[1]?.snapshot.checklist).toEqual([]);
  });

  it('examines a root found in the trash and makes no tree of it', async () => {
    const tasks = new InMemoryTasks({
      tasks: [taskState({ trash: trashIn(), version: 13 }), cad490State()],
    });

    const locked = await lock(tasks, [CAD_482, CAD_490]);

    expect(locked.examined).toEqual([CAD_482, CAD_490]);
    expect(membersOf(locked.trees)).toEqual([[CAD_490]]);
  });

  it('refuses a task in two trees as a defect', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState(), subtaskState()] });

    await expect(lock(tasks, [CAD_482, CAD_483])).rejects.toThrow(
      `The task ${CAD_483} of the tree of ${CAD_483} is not locked once.`,
    );
  });
});
