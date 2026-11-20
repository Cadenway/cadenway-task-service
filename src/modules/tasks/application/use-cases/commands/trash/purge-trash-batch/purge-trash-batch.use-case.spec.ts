import { describe, expect, it } from 'vitest';

import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_482_ENTRY,
  CAD_490,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NOW,
  PRODUIT,
  SPRINT_14,
  archiveFrom,
  cad490State,
  queryTask,
  storedEntry,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import type { StoredTrashEntry } from '../../../tasks.fixture.js';
import { PurgeTrashBatch } from './purge-trash-batch.use-case.js';

/** The entry of CAD-490, deleted from Bugs. */
const BUGS_ENTRY: string = '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e06';

/** 30 days before NOW, to the millisecond: an entry deleted then is due. */
const DUE: Date = new Date('2026-10-09T10:20:00.000Z');

/** Camille Martin, who emptied the trash. */
const camille = { type: 'user', id: CAMILLE } as const;

/**
 * Builds a use case on Atelier Nord with CAD-482 in the entry of Sprint 14 and CAD-490 in the
 * entry of Bugs.
 *
 * @param sprint - What replaces the entry of CAD-482.
 * @param bugs - What replaces the entry of CAD-490.
 * @param spaces - The fake spaces.
 * @returns The fake store, the fake spaces and the use case.
 */
function atelierNord(
  sprint: Partial<StoredTrashEntry>,
  bugs: Partial<StoredTrashEntry>,
  spaces: InMemorySpaceDirectory = new InMemorySpaceDirectory(),
): {
  readonly tasks: InMemoryTasks;
  readonly directory: InMemorySpaceDirectory;
  readonly useCase: PurgeTrashBatch;
} {
  const tasks = new InMemoryTasks({
    tasks: [
      taskState({ trash: trashIn(), version: 13 }),
      cad490State({ listId: BUGS, trash: trashIn(BUGS_ENTRY), version: 2 }),
    ],
    trashEntries: [
      storedEntry({ taskCount: 1, ...sprint }),
      storedEntry({
        id: BUGS_ENTRY,
        rootTaskId: CAD_490,
        listId: BUGS,
        taskCount: 1,
        ...bugs,
      }),
    ],
  });
  return { tasks, directory: spaces, useCase: new PurgeTrashBatch(tasks, spaces) };
}

/**
 * Builds a store holding CAD-482 with 25 subtasks of 20 subtasks each, 526 tasks in one entry due,
 * and CAD-490 alone in the entry of Bugs, due after it.
 *
 * @param entry - What replaces the entry of CAD-482.
 * @returns The fake store and the root.
 */
function bigEntry(entry: Partial<StoredTrashEntry> = {}): {
  readonly large: InMemoryTasks;
  readonly root: TaskState;
} {
  const root: TaskState = taskState({ trash: trashIn(), version: 13 });
  const big: TaskState[] = [root];
  for (let child = 0; child < 25; child += 1) {
    const middle: TaskState = queryTask(child * 21 + 1, {
      parentId: root.id,
      parentKey: root.key,
      trash: trashIn(),
      version: 2,
    });
    big.push(middle);
    for (let leaf = 0; leaf < 20; leaf += 1) {
      big.push(
        queryTask(child * 21 + 2 + leaf, {
          parentId: middle.id,
          parentKey: middle.key,
          trash: trashIn(),
          version: 2,
        }),
      );
    }
  }
  const large = new InMemoryTasks({
    tasks: [...big, cad490State({ listId: BUGS, trash: trashIn(BUGS_ENTRY), version: 2 })],
    trashEntries: [
      storedEntry({ taskCount: 526, trashedAt: new Date(DUE.getTime() - 1), ...entry }),
      storedEntry({
        id: BUGS_ENTRY,
        rootTaskId: CAD_490,
        listId: BUGS,
        taskCount: 1,
        trashedAt: DUE,
      }),
    ],
  });
  return { large, root };
}

describe('PurgeTrashBatch: one batch of the erasure of the trash of an organization', () => {
  it('erases the entries handed over first, with the requester of "Vider la corbeille"', async () => {
    const { tasks, useCase } = atelierNord(
      { purgeRequest: { at: NOW, by: camille } },
      { trashedAt: DUE },
    );

    expect(await useCase.execute({ organizationId: ATELIER_NORD })).toEqual({
      outcome: 'purged',
      entries: 1,
      tasks: 1,
      listsPurged: 0,
      spacesPurged: 0,
    });
    expect(tasks.trashEntries.has(CAD_482_ENTRY)).toBe(false);
    expect(tasks.trashEntries.has(BUGS_ENTRY)).toBe(true);
    expect(tasks.events).toEqual([
      expect.objectContaining({ kind: 'purged', key: 'CAD-482', version: 14, actor: camille }),
    ]);
  });

  it('then erases the entries due, 30 days after their deletion, as task-service', async () => {
    const { tasks, useCase } = atelierNord(
      { trashedAt: new Date(DUE.getTime() + 1) },
      { trashedAt: DUE },
    );

    expect(await useCase.execute({ organizationId: ATELIER_NORD })).toMatchObject({
      outcome: 'purged',
      entries: 1,
    });
    expect(tasks.trashEntries.has(BUGS_ENTRY)).toBe(false);
    expect(tasks.stored(CAD_482).trash).toEqual(trashIn());
    expect(tasks.events).toEqual([
      expect.objectContaining({
        key: 'CAD-490',
        actor: { type: 'system', id: 'task-service' },
      }),
    ]);
  });

  it('answers none-left when no entry is handed over or due', async () => {
    const { tasks, useCase } = atelierNord({}, {});

    expect(await useCase.execute({ organizationId: ATELIER_NORD })).toEqual({
      outcome: 'none-left',
    });
    expect(tasks.trashEntries.size).toBe(2);
  });

  it('erases the tombstones the entries leave without a task', async () => {
    const hugo = { type: 'user', id: HUGO } as const;
    const spaces = new InMemorySpaceDirectory({
      deletedLists: { [SPRINT_14]: hugo, [BUGS]: hugo },
      deletedSpaces: { [PRODUIT]: hugo },
    });
    const { useCase } = atelierNord({ trashedAt: DUE }, { trashedAt: DUE }, spaces);

    expect(await useCase.execute({ organizationId: ATELIER_NORD })).toEqual({
      outcome: 'purged',
      entries: 2,
      tasks: 2,
      listsPurged: 2,
      spacesPurged: 1,
    });
    expect(spaces.hasSpace(PRODUIT)).toBe(false);
  });

  it('locks the lists of the entries it erased in one call, then probes the deleted ones once', async () => {
    const hugo = { type: 'user', id: HUGO } as const;
    const trace: string[] = [];
    const spaces = new InMemorySpaceDirectory({ trace, deletedLists: { [BUGS]: hugo } });
    const tasks = new InMemoryTasks({
      tasks: [
        taskState({ trash: trashIn(), version: 13 }),
        cad490State({ listId: BUGS, trash: trashIn(BUGS_ENTRY), version: 2 }),
      ],
      trashEntries: [
        storedEntry({ taskCount: 1, trashedAt: DUE }),
        storedEntry({
          id: BUGS_ENTRY,
          rootTaskId: CAD_490,
          listId: BUGS,
          taskCount: 1,
          trashedAt: DUE,
        }),
      ],
      trace,
    });

    expect(
      await new PurgeTrashBatch(tasks, spaces).execute({ organizationId: ATELIER_NORD }),
    ).toMatchObject({ entries: 2, listsPurged: 1 });
    expect(
      trace.filter((call: string): boolean =>
        ['spaces.lockDeletedLists', 'tasks.listsWithTasks', 'spaces.purgeDeletedList'].includes(
          call,
        ),
      ),
    ).toEqual(['spaces.lockDeletedLists', 'tasks.listsWithTasks', 'spaces.purgeDeletedList']);
    expect(spaces.purgeCalls).toEqual([BUGS]);
  });

  it('locks 20 entries at most and stops once it holds 500 tasks or more', async () => {
    const stored: TaskState[] = [];
    const entries: StoredTrashEntry[] = [];
    for (let index = 0; index < 25; index += 1) {
      const entryId = `019a7006-0000-7000-8000-${String(index).padStart(12, '0')}`;
      const root: TaskState = queryTask(index + 1, { trash: trashIn(entryId), version: 2 });
      stored.push(root);
      entries.push(
        storedEntry({
          id: entryId,
          rootTaskId: root.id,
          taskCount: 1,
          trashedAt: new Date(DUE.getTime() - index),
        }),
      );
    }
    const tasks = new InMemoryTasks({ tasks: stored, trashEntries: entries });
    const useCase = new PurgeTrashBatch(tasks, new InMemorySpaceDirectory());

    expect(await useCase.execute({ organizationId: ATELIER_NORD })).toMatchObject({
      outcome: 'purged',
      entries: 20,
    });
    expect(tasks.trashEntries.size).toBe(5);
  });

  it('erases an entry of more than 500 tasks in parts of 500, the deepest first, hidden from the first', async () => {
    const { large, root } = bigEntry();
    const batch = new PurgeTrashBatch(large, new InMemorySpaceDirectory());

    expect(await batch.execute({ organizationId: ATELIER_NORD })).toEqual({
      outcome: 'purged',
      entries: 0,
      tasks: 500,
      listsPurged: 0,
      spacesPurged: 0,
    });
    // The 500 leaves went first; the root and its 25 subtasks wait, the entry handed over.
    expect(large.tasks.has(CAD_482)).toBe(true);
    expect([...large.tasks.values()].filter((task) => task.parentId === root.id)).toHaveLength(25);
    expect(large.trashEntries.get(CAD_482_ENTRY)).toMatchObject({
      taskCount: 26,
      purgeRequest: { at: NOW, by: { type: 'system', id: 'task-service' } },
    });
    expect(large.events).toHaveLength(500);
    expect(
      large.events.every(
        (event) =>
          event.kind === 'purged' &&
          event.key !== 'CAD-482' &&
          event.parentKey !== 'CAD-482' &&
          event.actor.id === 'task-service',
      ),
    ).toBe(true);
    expect(large.trace).toEqual(
      expect.arrayContaining(['tasks.entryTree', 'tasks.lockEntryTasks:update', 'trash.erasePart']),
    );
    expect(large.trace).not.toContain('trash.erase');

    // The entry, handed over by then, comes before the entries due and goes whole.
    expect(await batch.execute({ organizationId: ATELIER_NORD })).toMatchObject({
      entries: 1,
      tasks: 26,
    });
    expect(large.tasks.has(CAD_482)).toBe(false);
    expect(large.trashEntries.has(CAD_482_ENTRY)).toBe(false);
    expect(large.trashEntries.has(BUGS_ENTRY)).toBe(true);
  });

  it('keeps the requester of a hand-over for every part of an entry it erases', async () => {
    const { large } = bigEntry({ purgeRequest: { at: NOW, by: camille } });
    const batch = new PurgeTrashBatch(large, new InMemorySpaceDirectory());

    await batch.execute({ organizationId: ATELIER_NORD });

    expect(large.trashEntries.get(CAD_482_ENTRY)?.purgeRequest).toEqual({ at: NOW, by: camille });
    expect(large.events.every((event) => event.actor.id === CAMILLE)).toBe(true);
  });

  it('stops before an entry of more than 500 tasks that does not come first', async () => {
    const { large } = bigEntry({ trashedAt: DUE });
    large.trashEntries.set(BUGS_ENTRY, {
      ...storedEntry({ id: BUGS_ENTRY, rootTaskId: CAD_490, listId: BUGS, taskCount: 1 }),
      trashedAt: new Date(DUE.getTime() - 1),
    });
    const batch = new PurgeTrashBatch(large, new InMemorySpaceDirectory());

    expect(await batch.execute({ organizationId: ATELIER_NORD })).toMatchObject({
      entries: 1,
      tasks: 1,
    });
    expect(large.trashEntries.get(CAD_482_ENTRY)?.taskCount).toBe(526);
    expect(large.trashEntries.has(BUGS_ENTRY)).toBe(false);
  });

  it('locks the tasks of all the entries it takes in one statement, archived ones included', async () => {
    const { tasks, useCase } = atelierNord(
      { trashedAt: new Date(DUE.getTime() - 1) },
      { trashedAt: DUE },
    );
    tasks.tasks.set(CAD_490, {
      ...cad490State({ listId: BUGS, trash: trashIn(BUGS_ENTRY), version: 2 }),
      archive: archiveFrom(CAD_490),
    });

    expect(await useCase.execute({ organizationId: ATELIER_NORD })).toMatchObject({
      entries: 2,
      tasks: 2,
    });
    expect(
      tasks.trace.filter((call: string): boolean => call.startsWith('tasks.lockTrashEntries')),
    ).toEqual(['tasks.lockTrashEntries:update']);
    expect(tasks.tasks.size).toBe(0);
  });
});
