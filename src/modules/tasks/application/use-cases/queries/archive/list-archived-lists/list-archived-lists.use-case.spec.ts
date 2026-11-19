import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAMILLE,
  HUGO_ACTOR,
  InMemorySpaceDirectory,
  InMemoryTasks,
  SPRINT_14,
  STRANGER,
  archiveFrom,
  atelierNordLists,
  atelierNordMembers,
  placedList,
  queryTask,
  refusalOf,
  subtaskState,
  taskState,
} from '../../../tasks.fixture.js';
import type { ListArchivedListsInput } from './list-archived-lists.input.js';
import { ListArchivedLists } from './list-archived-lists.use-case.js';

/** When "Bugs" was archived, after Sprint 14. */
const LATER: Date = new Date('2026-11-06T08:00:00.000Z');

/**
 * Builds the read of a page by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<ListArchivedListsInput> = {}): ListArchivedListsInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    after: null,
    limit: 50,
    ...overrides,
  };
}

/**
 * Builds a use case on Atelier Nord with Sprint 14 and Bugs archived. Sprint 14 holds CAD-482
 * with its subtask CAD-483, CAD-801 and CAD-802 archived; Bugs holds nothing.
 *
 * @returns The fake store and the use case.
 */
function atelierNord(): { readonly tasks: InMemoryTasks; readonly useCase: ListArchivedLists } {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({
    tasks: [
      taskState(),
      subtaskState(),
      queryTask(1),
      queryTask(2, { archive: archiveFrom(queryTask(2).id), version: 2 }),
    ],
    trace,
  });
  const [sprint14, , maquettes, clotures] = atelierNordLists({
    archivedAt: ARCHIVED_AT,
    archivedBy: HUGO_ACTOR,
  });
  const spaces = new InMemorySpaceDirectory({
    lists: [
      sprint14 ?? placedList(),
      placedList({
        id: BUGS,
        name: 'Bugs',
        sprint: null,
        archivedAt: LATER,
        archivedBy: HUGO_ACTOR,
      }),
      ...(maquettes === undefined ? [] : [maquettes]),
      ...(clotures === undefined ? [] : [clotures]),
    ],
    trace,
  });
  return { tasks, useCase: new ListArchivedLists(tasks, atelierNordMembers([], trace), spaces) };
}

describe('ListArchivedLists: the archived lists the actor has a role on, the latest first', () => {
  it('lists each archived list with its role, its archive and its live top-level tasks, subtasks and archived tasks left out', async () => {
    const { useCase } = atelierNord();

    const page = await useCase.execute(read());

    expect(page.items.map((item) => [item.list.id, item.taskCount])).toEqual([
      [BUGS, 0],
      [SPRINT_14, 2],
    ]);
    expect(page.items[1]?.list).toMatchObject({
      archivedAt: ARCHIVED_AT,
      archivedBy: HUGO_ACTOR,
      callerRole: 'edit',
    });
    expect(page).toMatchObject({ next: null, total: 2 });
  });

  it('pages after the archive instant and the id of the last list, the total on every page', async () => {
    const { useCase } = atelierNord();

    const first = await useCase.execute(read({ limit: 1 }));
    const second = await useCase.execute(read({ limit: 1, after: first.next }));

    expect(first.next).toEqual({ archivedAt: LATER, id: BUGS });
    expect(second.items.map((item) => item.list.id)).toEqual([SPRINT_14]);
    expect(second).toMatchObject({ next: null, total: 2 });
  });

  it('reads no task for an empty page', async () => {
    const { tasks, useCase } = atelierNord();

    const page = await useCase.execute(
      read({ after: { archivedAt: new Date('2026-01-01T00:00:00.000Z'), id: CAD_482 } }),
    );

    expect(page).toEqual({ items: [], next: null, total: 2 });
    expect(tasks.trace).not.toContain('archives.liveRootCounts');
  });

  it('reads in one read-only snapshot and refuses an actor the copy does not hold', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute(read());

    expect(tasks.snapshotRuns).toBe(1);
    expect(await refusalOf(useCase.execute(read({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});
