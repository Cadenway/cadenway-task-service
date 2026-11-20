import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  ATELIER_NORD,
  BUGS,
  CAMILLE,
  HUGO_ACTOR,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NADIA,
  PRODUIT,
  archiveFrom,
  atelierNordLists,
  atelierNordMembers,
  queryTask,
  refusalOf,
} from '../../../tasks.fixture.js';
import { ListSpaceMilestones } from './list-space-milestones.use-case.js';

/** First page of milestones in Produit for its owner. */
const request = {
  organizationId: ATELIER_NORD,
  actorUserId: CAMILLE,
  spaceId: PRODUIT,
  after: null,
  limit: 1,
};

describe('ListSpaceMilestones', () => {
  it('pages dated milestones before undated ones and excludes archived tasks and lists', async () => {
    const archived = queryTask(3);
    const tasks = new InMemoryTasks({
      tasks: [
        queryTask(1, { listId: BUGS, milestone: true }),
        queryTask(2, {
          listId: BUGS,
          milestone: true,
          dueDate: '2026-11-20',
          startDate: '2026-11-20',
        }),
        { ...archived, listId: BUGS, milestone: true, archive: archiveFrom(archived.id) },
        queryTask(4, { milestone: true }),
        queryTask(5, { listId: BUGS }),
      ],
    });
    const spaces = new InMemorySpaceDirectory({
      lists: atelierNordLists({ archivedAt: ARCHIVED_AT, archivedBy: HUGO_ACTOR }),
    });
    const milestones = new ListSpaceMilestones(tasks, atelierNordMembers(), spaces);

    const first = await milestones.execute(request);
    expect(first.items.map((row) => row.key)).toEqual(['CAD-802']);
    expect(first.next).toMatchObject({ dueDate: '2026-11-20' });
    expect(first.total).toBe(2);
    expect(tasks.snapshotRuns).toBe(1);

    const next = await milestones.execute({ ...request, after: first.next });
    expect(next.items.map((row) => row.key)).toEqual(['CAD-801']);
    expect(next.next).toBeNull();
    expect(next.total).toBe(2);
  });

  it('counts only a list granted to a guest and conceals a space they cannot see', async () => {
    const tasks = new InMemoryTasks({
      tasks: [queryTask(1, { listId: BUGS, milestone: true }), queryTask(2, { milestone: true })],
    });
    const spaces = new InMemorySpaceDirectory({ listGrants: { [BUGS]: { [NADIA]: 'view' } } });
    const milestones = new ListSpaceMilestones(tasks, atelierNordMembers(), spaces);
    const guest = { ...request, actorUserId: NADIA };
    const page = await milestones.execute(guest);

    expect(page.items.map((row) => row.key)).toEqual(['CAD-801']);
    expect(page.total).toBe(1);
    const inaccessible = new ListSpaceMilestones(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );
    expect(await refusalOf(inaccessible.execute(guest))).toEqual({ reason: 'space-not-found' });
  });
});
