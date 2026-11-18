import { describe, expect, it } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { ActivityEntryState } from '../../../../../domain/value-objects/activity/activity-entry-state.value-object.js';
import {
  ATELIER_NORD,
  BUGS,
  CAD_490,
  CAMILLE,
  DESIGN,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  INES,
  MAQUETTES,
  NADIA,
  SPRINT_14,
  STRANGER,
  UNKNOWN_LIST,
  atelierNordMembers,
  cad490State,
  priorityEntry,
  refusalOf,
  taskState,
} from '../../../tasks.fixture.js';
import type { ListListActivityInput } from './list-list-activity.input.js';
import { ListListActivity } from './list-list-activity.use-case.js';

/** The task DES-1, which was in Sprint 14 and now is in the private space "Design" of Hugo Dubois. */
const DES_1 = '019a7200-0000-7000-8000-000000000601';

/**
 * Builds the reading of the first page of the activity of Sprint 14 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<ListListActivityInput> = {}): ListListActivityInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    listId: SPRINT_14,
    kinds: null,
    actorIds: null,
    after: null,
    limit: 10,
    ...overrides,
  };
}

/**
 * Builds an entry at a minute of the morning of 8 November 2026.
 *
 * @param index - Which entry; it gives the id and, in minutes, the instant.
 * @param overrides - Fields to replace.
 * @returns The entry.
 */
function entry(index: number, overrides: Partial<ActivityEntryState> = {}): ActivityEntryState {
  return priorityEntry({
    id: `019a7400-0000-7000-8000-00000000000${String(index)}`,
    occurredAt: new Date(Date.UTC(2026, 10, 8, 9, index)),
    ...overrides,
  });
}

/** A use case on Atelier Nord with five entries, one of which is of a task moved to Design. */
function atelierNord(): ListListActivity {
  return new ListListActivity(
    new InMemoryTasks({
      tasks: [
        taskState(),
        cad490State({ listId: BUGS }),
        taskState({
          id: DES_1,
          key: TaskKey.of('DES', 1),
          listId: MAQUETTES,
          spaceId: DESIGN,
          name: 'Icônes',
        }),
      ],
      activity: [
        entry(1),
        entry(2, { actor: { type: 'user', id: INES }, change: { kind: 'create' } }),
        entry(3, { taskId: CAD_490 }),
        entry(4, { taskId: DES_1 }),
        entry(5, { listId: BUGS }),
      ],
    }),
    atelierNordMembers(),
    new InMemorySpaceDirectory(),
  );
}

describe('ListListActivity: the entries recorded while tasks were in a list, most recent first', () => {
  it('reads the entries of the list with their task as it is now, and leaves out those of other lists', async () => {
    const page = await atelierNord().execute(read());

    expect(page.items.map((item) => item.id)).toEqual([entry(3).id, entry(2).id, entry(1).id]);
    expect(page.items[0]).toMatchObject({
      listId: SPRINT_14,
      task: { key: 'CAD-490', status: 'todo' },
    });
    expect(page.total).toBe(3);
  });

  it('keeps an entry of a task now in another list the actor sees', async () => {
    const page = await atelierNord().execute(read());

    expect(page.items.map((item) => item.task.key)).toContain('CAD-490');
  });

  it('leaves out of the items and of the total the entries of a task now in a private space of another member', async () => {
    const page = await atelierNord().execute(read({ limit: 1 }));

    expect(page.items.map((item) => item.task.key)).not.toContain('DES-1');
    expect(page.total).toBe(3);
  });

  it('shows those entries to the owner of that private space', async () => {
    const page = await atelierNord().execute(read({ actorUserId: HUGO }));

    expect(page.total).toBe(4);
    expect(page.items.map((item) => item.task.key)).toContain('DES-1');
  });

  it('filters by kind', async () => {
    const page = await atelierNord().execute(read({ kinds: ['create'] }));

    expect(page.items.map((item) => item.id)).toEqual([entry(2).id]);
    expect(page.total).toBe(1);
  });

  it('filters by actor id, whatever the type of the actor', async () => {
    const page = await atelierNord().execute(read({ actorIds: [INES] }));

    expect(page.items.map((item) => item.id)).toEqual([entry(2).id]);
    expect(page.total).toBe(1);
  });

  it('walks the pages with the position of the last entry', async () => {
    const useCase = atelierNord();

    const first = await useCase.execute(read({ limit: 2 }));
    const second = await useCase.execute(read({ limit: 2, after: first.next }));

    expect(first.items.map((item) => item.id)).toEqual([entry(3).id, entry(2).id]);
    expect(first.next).toEqual({ occurredAt: entry(2).occurredAt, id: entry(2).id });
    expect(second.items.map((item) => item.id)).toEqual([entry(1).id]);
    expect(second.next).toBeNull();
    expect(second.total).toBe(3);
  });
});

describe('ListListActivity: what the actor does not see is not found', () => {
  it.each([
    ['an unknown list', { listId: UNKNOWN_LIST }],
    ['any list, for a guest', { actorUserId: NADIA }],
    ['a list of the private space of another member', { listId: MAQUETTES }],
  ] as const)('refuses %s as list-not-found', async (_name, overrides) => {
    expect(await refusalOf(atelierNord().execute(read(overrides)))).toEqual({
      reason: 'list-not-found',
    });
  });

  it('refuses an account the copy does not hold as organization-not-found', async () => {
    expect(await refusalOf(atelierNord().execute(read({ actorUserId: STRANGER })))).toEqual({
      reason: 'organization-not-found',
    });
  });
});

describe('ListListActivity: the read runs in one read-only transaction', () => {
  it('opens a single read-only run, with the default isolation, with no snapshot', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });

    await new ListListActivity(tasks, atelierNordMembers(), new InMemorySpaceDirectory()).execute(
      read(),
    );

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(0);
  });
});
