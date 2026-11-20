import { describe, expect, it } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_483,
  CAD_484,
  CAD_490,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NOW,
  PRODUIT,
  SPRINT_14,
  UNKNOWN_LIST,
  archiveFrom,
  cad490State,
  queryTask,
  storedEntry,
  subtaskState,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import type { TrashDeletedListTasksOutput } from './trash-deleted-list-tasks.output.js';
import { TrashDeletedListTasks } from './trash-deleted-list-tasks.use-case.js';

/** Hugo Dubois, who deleted Sprint 14. */
const hugo = { type: 'user', id: HUGO } as const;

/**
 * Builds a use case on Atelier Nord whose Sprint 14 is deleted by Hugo Dubois.
 *
 * @param stored - The tasks.
 * @param spaces - The fake spaces; Sprint 14 deleted when left out.
 * @returns The fake store, the fake spaces and the use case.
 */
function deletedSprint(
  stored: readonly TaskState[],
  spaces: InMemorySpaceDirectory = new InMemorySpaceDirectory({
    deletedLists: { [SPRINT_14]: hugo },
  }),
): {
  readonly tasks: InMemoryTasks;
  readonly directory: InMemorySpaceDirectory;
  readonly useCase: TrashDeletedListTasks;
} {
  const tasks = new InMemoryTasks({ tasks: stored });
  return { tasks, directory: spaces, useCase: new TrashDeletedListTasks(tasks, spaces) };
}

/**
 * Narrows an output to a batch that moved tasks.
 *
 * @param output - The output.
 * @returns The batch.
 */
function trashedOf(
  output: TrashDeletedListTasksOutput,
): Extract<TrashDeletedListTasksOutput, { outcome: 'trashed' }> {
  if (output.outcome !== 'trashed') {
    throw new Error(`Expected a batch that moved tasks, got ${output.outcome}.`);
  }
  return output;
}

describe('TrashDeletedListTasks: one entry per top-level task of a deleted list', () => {
  it('moves each live top-level task with its live subtree, by the actor of the deletion', async () => {
    const { tasks, useCase } = deletedSprint([taskState(), subtaskState(), cad490State()]);

    const output = trashedOf(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    );

    expect(output).toMatchObject({ entries: 2, last: { id: CAD_490 } });
    expect(new Set(output.taskIds)).toEqual(new Set([CAD_482, CAD_483, CAD_490]));
    const entries = [...tasks.trashEntries.values()];
    expect(entries.map((entry) => [entry.rootTaskId, entry.taskCount])).toEqual([
      [CAD_482, 2],
      [CAD_490, 1],
    ]);
    expect(entries.every((entry) => entry.trashedBy.id === HUGO && entry.trashedAt === NOW)).toBe(
      true,
    );
    expect(tasks.stored(CAD_483).trash).toEqual({ entryId: entries[0]?.id });
    expect(tasks.events.map((event) => [event.kind, event.key, event.actor.id])).toEqual([
      ['trashed', 'CAD-482', HUGO],
      ['trashed', 'CAD-483', HUGO],
      ['trashed', 'CAD-490', HUGO],
    ]);
  });

  it('takes the archived subtasks with their top-level ancestor, each keeping its archive', async () => {
    const archived: TaskState[] = [
      subtaskState({ archive: archiveFrom(CAD_483), version: 2 }),
      cad490State({
        parentId: CAD_483,
        parentKey: TaskKey.of('CAD', 483),
        archive: archiveFrom(CAD_483),
        version: 2,
      }),
    ];
    const { tasks, useCase } = deletedSprint([taskState(), ...archived]);

    const output = trashedOf(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    );

    expect(output.entries).toBe(1);
    const [entry] = [...tasks.trashEntries.values()];
    expect(entry).toMatchObject({ rootTaskId: CAD_482, taskCount: 3, parentKey: null });
    expect(tasks.stored(CAD_483)).toMatchObject({
      archive: archiveFrom(CAD_483),
      trash: { entryId: entry?.id },
      version: 3,
    });
    expect(tasks.stored(CAD_490)).toMatchObject({
      archive: archiveFrom(CAD_483),
      trash: { entryId: entry?.id },
    });
    expect(tasks.events.map((event) => event.key)).toEqual(['CAD-482', 'CAD-483', 'CAD-490']);
  });

  it('makes its own entry of an archived top-level task, which keeps its archive', async () => {
    const { tasks, useCase } = deletedSprint([
      cad490State({ archive: archiveFrom(CAD_490), version: 2 }),
    ]);

    const output = trashedOf(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    );

    expect(output).toMatchObject({ entries: 1, taskIds: [CAD_490] });
    expect(tasks.stored(CAD_490)).toMatchObject({
      archive: archiveFrom(CAD_490),
      trash: { entryId: [...tasks.trashEntries.values()][0]?.id },
    });
  });

  it('makes its own entry of a task whose parent is in another list or in the trash, as detached', async () => {
    const { tasks, useCase } = deletedSprint([
      taskState({ listId: BUGS }),
      subtaskState({ archive: archiveFrom(CAD_483), version: 2 }),
      cad490State({ id: CAD_484, key: TaskKey.of('CAD', 484), trash: trashIn(), version: 2 }),
      cad490State({ parentId: CAD_484, parentKey: TaskKey.of('CAD', 484) }),
    ]);

    const output = trashedOf(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    );

    expect(output.entries).toBe(2);
    expect(
      new Map([...tasks.trashEntries.values()].map((entry) => [entry.rootTaskId, entry.parentKey])),
    ).toEqual(
      new Map([
        [CAD_483, null],
        [CAD_490, null],
      ]),
    );
    expect(tasks.stored(CAD_482).trash).toBeNull();
  });

  it('reads the trees of the roots in one statement, locks them in one, reads them again, then holds the list', async () => {
    const { tasks, useCase } = deletedSprint([taskState(), subtaskState(), cad490State()]);

    await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null });

    expect(tasks.trace.slice(0, 4)).toEqual([
      'tasks.trashCandidates',
      'tasks.trashTrees',
      'tasks.lockByIds',
      'tasks.trashTrees',
    ]);
  });

  it('leaves the tasks in the trash already in their own entry', async () => {
    const { tasks, useCase } = deletedSprint([
      taskState({ trash: trashIn(), version: 13 }),
      cad490State(),
    ]);

    const output = trashedOf(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    );

    expect(output.taskIds).toEqual([CAD_490]);
    expect(tasks.stored(CAD_482)).toMatchObject({ trash: trashIn(), version: 13 });
  });

  it('takes 50 roots at most and continues after the last one', async () => {
    const roots: TaskState[] = Array.from({ length: 60 }, (_: unknown, index: number) =>
      queryTask(index + 1),
    );
    const { useCase } = deletedSprint(roots);

    const first = trashedOf(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    );
    const second = trashedOf(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: first.last }),
    );

    expect(first.entries).toBe(50);
    expect(first.last).toEqual({ createdAt: roots[49]?.createdAt, id: roots[49]?.id });
    expect(second.entries).toBe(10);
  });

  it('stops adding roots once the batch holds 500 tasks or more', async () => {
    const roots: TaskState[] = [];
    for (let root = 0; root < 3; root += 1) {
      const top: TaskState = queryTask(root * 300 + 1);
      roots.push(top);
      for (let child = 0; child < 24; child += 1) {
        const middle: TaskState = queryTask(root * 300 + 2 + child * 11, {
          parentId: top.id,
          parentKey: top.key,
        });
        roots.push(middle);
        for (let leaf = 0; leaf < 10; leaf += 1) {
          roots.push(
            queryTask(root * 300 + 3 + child * 11 + leaf, {
              parentId: middle.id,
              parentKey: middle.key,
            }),
          );
        }
      }
    }
    const { useCase } = deletedSprint(roots);

    const output = trashedOf(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    );

    // Each root holds 265 tasks: two make 530, the third waits for the next batch.
    expect(output.entries).toBe(2);
    expect(output.taskIds).toHaveLength(530);
  });

  it('writes nothing once a restoration brought the list back', async () => {
    const { tasks, useCase } = deletedSprint([taskState()], new InMemorySpaceDirectory());

    expect(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    ).toEqual({ outcome: 'list-live' });
    expect(tasks.trashEntries.size).toBe(0);
    expect(tasks.events).toEqual([]);
  });

  it('writes nothing and answers list-gone for a list the fake spaces no longer know', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ listId: UNKNOWN_LIST })] });
    const useCase = new TrashDeletedListTasks(tasks, new InMemorySpaceDirectory());

    expect(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: UNKNOWN_LIST, after: null }),
    ).toEqual({ outcome: 'list-gone' });
    expect(tasks.trashEntries.size).toBe(0);
    expect(tasks.events).toEqual([]);
  });
});

describe('TrashDeletedListTasks: with no root left, the tombstone goes once no task references it', () => {
  it('erases the deleted list, and its deleted space with its last list', async () => {
    const spaces = new InMemorySpaceDirectory({
      deletedLists: { [SPRINT_14]: hugo, [BUGS]: hugo },
      deletedSpaces: { [PRODUIT]: hugo },
    });
    const { useCase } = deletedSprint([], spaces);

    expect(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    ).toEqual({ outcome: 'none-left', listPurged: true, spacePurged: false });
    expect(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: BUGS, after: null }),
    ).toEqual({ outcome: 'none-left', listPurged: true, spacePurged: true });
    expect(spaces.hasSpace(PRODUIT)).toBe(false);
  });

  it('keeps a list whose tasks wait in the trash, until their entries are erased', async () => {
    const { directory, useCase } = deletedSprint([taskState({ trash: trashIn(), version: 13 })]);

    expect(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    ).toEqual({ outcome: 'none-left', listPurged: false, spacePurged: false });
    expect(directory.purgeCalls).toEqual([]);
  });

  it('answers list-live for a list a restoration brought back and list-gone for an erased one', async () => {
    const live = new InMemorySpaceDirectory();
    const { useCase } = deletedSprint([], live);

    expect(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    ).toEqual({ outcome: 'list-live' });
    expect(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: UNKNOWN_LIST, after: null }),
    ).toEqual({ outcome: 'list-gone' });
    expect(live.purgeCalls).toEqual([]);
  });

  it('answers rescan when no root is left after the position but tasks out of the trash are', async () => {
    const { directory, tasks, useCase } = deletedSprint([
      taskState(),
      cad490State({ createdAt: new Date(taskState().createdAt.getTime() - 1) }),
    ]);

    expect(
      await useCase.execute({
        organizationId: ATELIER_NORD,
        listId: SPRINT_14,
        after: { createdAt: new Date(taskState().createdAt.getTime() + 1), id: CAD_482 },
      }),
    ).toEqual({ outcome: 'rescan' });
    expect(tasks.trashEntries.size).toBe(0);
    expect(directory.purgeCalls).toEqual([]);
  });

  it('holds the list before it checks the tasks left and erases the tombstone, under that lock', async () => {
    const trace: string[] = [];
    const spaces = new InMemorySpaceDirectory({ trace, deletedLists: { [SPRINT_14]: hugo } });
    const tasks = new InMemoryTasks({ tasks: [], trace });
    const useCase = new TrashDeletedListTasks(tasks, spaces);

    await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null });

    expect(
      trace.filter((call: string): boolean =>
        ['spaces.holdList', 'tasks.listsWithTasks', 'spaces.purgeDeletedList'].includes(call),
      ),
    ).toEqual(['spaces.holdList', 'tasks.listsWithTasks', 'spaces.purgeDeletedList']);
  });

  it('ignores an entry already stored for another list', async () => {
    const tasks = new InMemoryTasks({
      tasks: [cad490State({ listId: BUGS, trash: trashIn(), version: 2 })],
      trashEntries: [storedEntry({ rootTaskId: CAD_490, listId: BUGS, taskCount: 1 })],
    });
    const useCase = new TrashDeletedListTasks(
      tasks,
      new InMemorySpaceDirectory({ deletedLists: { [SPRINT_14]: hugo } }),
    );

    expect(
      await useCase.execute({ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }),
    ).toEqual({ outcome: 'none-left', listPurged: true, spacePurged: false });
  });
});
