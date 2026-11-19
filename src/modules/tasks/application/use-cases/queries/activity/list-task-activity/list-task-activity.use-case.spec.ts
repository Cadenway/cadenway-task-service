import { describe, expect, it } from 'vitest';

import type { ActivityEntryState } from '../../../../../domain/value-objects/activity/activity-entry-state.value-object.js';
import {
  ATELIER_NORD,
  CAD_490,
  CAMILLE,
  DESIGN,
  InMemorySpaceDirectory,
  InMemoryTasks,
  INES,
  MAQUETTES,
  NADIA,
  SPRINT_14,
  atelierNordMembers,
  cad490State,
  priorityEntry,
  refusalOf,
  taskState,
} from '../../../tasks.fixture.js';
import type { ListTaskActivityInput } from './list-task-activity.input.js';
import { ListTaskActivity } from './list-task-activity.use-case.js';

/**
 * Builds the reading of the first page of the activity of CAD-482 by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The input.
 */
function read(overrides: Partial<ListTaskActivityInput> = {}): ListTaskActivityInput {
  return {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: 'CAD-482',
    kinds: null,
    after: null,
    limit: 2,
    ...overrides,
  };
}

/**
 * Builds an entry of CAD-482 at a minute of the morning of 8 November 2026.
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

/**
 * Builds a use case on Atelier Nord holding CAD-482 and three entries of it.
 *
 * @param stored - The tasks.
 * @returns The use case.
 */
function atelierNord(stored = [taskState()]): ListTaskActivity {
  return new ListTaskActivity(
    new InMemoryTasks({
      tasks: stored,
      activity: [
        entry(1, { change: { kind: 'create' } }),
        entry(2, { change: { kind: 'status', status: { from: 'todo', to: 'progress' } } }),
        entry(3),
      ],
    }),
    atelierNordMembers(),
    new InMemorySpaceDirectory(),
  );
}

describe('ListTaskActivity: the entries of a task, most recent first', () => {
  it('reads the first page with the task as it is now, where the next page starts and the total', async () => {
    const page = await atelierNord().execute(read());

    expect(page.items.map((item) => item.id)).toEqual([entry(3).id, entry(2).id]);
    expect(page.items[0]).toEqual({
      id: entry(3).id,
      occurredAt: entry(3).occurredAt,
      kind: 'priority',
      actor: { type: 'user', id: CAMILLE },
      task: { key: 'CAD-482', name: 'Refondre l’écran de connexion SSO', status: 'progress' },
      listId: SPRINT_14,
      change: { kind: 'priority', priority: { from: 'moyenne', to: 'haute' } },
    });
    expect(page.next).toEqual({ occurredAt: entry(2).occurredAt, id: entry(2).id });
    expect(page.total).toBe(3);
  });

  it('reads the next page from the position of the last entry', async () => {
    const useCase = atelierNord();
    const first = await useCase.execute(read());

    const page = await useCase.execute(read({ after: first.next }));

    expect(page.items.map((item) => item.kind)).toEqual(['create']);
    expect(page.next).toBeNull();
  });

  it('keeps the kinds asked for, and counts the total of those', async () => {
    const page = await atelierNord().execute(read({ kinds: ['status', 'create'] }));

    expect(page.items.map((item) => item.kind)).toEqual(['status', 'create']);
    expect(page.total).toBe(2);
  });

  it('has an empty page for a kind with no entry', async () => {
    expect(await atelierNord().execute(read({ kinds: ['due'] }))).toEqual({
      items: [],
      next: null,
      total: 0,
    });
  });

  it('does not show the entries of another task', async () => {
    const useCase = new ListTaskActivity(
      new InMemoryTasks({
        tasks: [taskState(), cad490State()],
        activity: [entry(1), entry(2, { taskId: CAD_490 })],
      }),
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );

    const page = await useCase.execute(read());

    expect(page.items.map((item) => item.id)).toEqual([entry(1).id]);
    expect(page.total).toBe(1);
  });
});

describe('ListTaskActivity: what the actor does not see is not found', () => {
  it.each([
    ['an unknown task', { taskKey: 'CAD-999' }],
    ['a task of no list shared with a guest', { actorUserId: NADIA }],
  ] as const)('refuses %s', async (_name, overrides) => {
    expect(await refusalOf(atelierNord().execute(read(overrides)))).toEqual({
      reason: 'task-not-found',
    });
  });

  it('refuses a task of the private space of another member', async () => {
    const useCase = atelierNord([taskState({ listId: MAQUETTES, spaceId: DESIGN })]);

    expect(await refusalOf(useCase.execute(read({ actorUserId: INES })))).toEqual({
      reason: 'task-not-found',
    });
  });
});

describe('ListTaskActivity: the read runs in one read-only transaction', () => {
  it('opens a single read-only run, with the default isolation, with no snapshot', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState()] });

    await new ListTaskActivity(tasks, atelierNordMembers(), new InMemorySpaceDirectory()).execute(
      read(),
    );

    expect(tasks.runs).toBe(1);
    expect(tasks.readOnlyRuns).toBe(1);
    expect(tasks.snapshotRuns).toBe(0);
  });
});
