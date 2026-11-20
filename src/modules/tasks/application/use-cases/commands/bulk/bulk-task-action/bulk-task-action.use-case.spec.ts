import { describe, expect, it, vi } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import { BulkTaskExpansionError } from '../../../../models/bulk/bulk-task-expansion.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import {
  ATELIER_NORD,
  ARCHIVES,
  BUGS,
  CAD_482,
  CAD_483,
  CAMILLE,
  CLOTURES,
  HUGO,
  INES,
  InMemorySpaceDirectory,
  InMemoryTasks,
  SPRINT_14,
  TRASH_WRITES_OFF,
  TRASH_WRITES_ON,
  archiveFrom,
  atelierNordMembers,
  refusalOf,
  subtaskState,
  taskState,
} from '../../../tasks.fixture.js';
import type { BulkTaskActionInput } from './bulk-task-action.input.js';
import { BulkTaskAction } from './bulk-task-action.use-case.js';

const selection = [
  { taskKey: 'CAD-483', version: 1 },
  { taskKey: 'CAD-482', version: 12 },
];
const caller = { organizationId: ATELIER_NORD, actorUserId: CAMILLE };

function fixture(stored: readonly TaskState[] = [taskState(), subtaskState()]) {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ tasks: stored, trace });
  const members = atelierNordMembers([], trace);
  const spaces = new InMemorySpaceDirectory({ trace });
  const useCase = new BulkTaskAction(TRASH_WRITES_ON, tasks, members, spaces);
  return { tasks, members, spaces, useCase, trace };
}

function request(action: BulkTaskActionInput['action']): BulkTaskActionInput {
  return { ...caller, selection, action };
}

describe('BulkTaskAction', () => {
  it('locks the expanded tasks before their placements and moves a covered selection once', async () => {
    const { tasks, spaces, useCase, trace } = fixture();

    const result = await useCase.execute(request({ type: 'move', listId: BUGS.toUpperCase() }));

    expect(result).toStrictEqual({
      affectedCount: 2,
      results: [
        { taskKey: 'CAD-483', version: 2 },
        { taskKey: 'CAD-482', version: 13 },
      ],
    });
    expect(tasks.runs).toBe(1);
    expect(tasks.stored(CAD_482)).toMatchObject({ listId: BUGS, status: 'progress' });
    expect(tasks.stored(CAD_483)).toMatchObject({
      listId: BUGS,
      parentId: CAD_482,
      status: 'todo',
    });
    expect(tasks.events.map(({ kind, key }) => [kind, key])).toEqual([
      ['updated', 'CAD-482'],
      ['updated', 'CAD-483'],
    ]);
    expect(trace.filter((call) => call === 'tasks.lockByIds')).toHaveLength(1);
    expect(trace.indexOf('tasks.lockByIds')).toBeLessThan(trace.indexOf('spaces.lockTrashLists'));
    expect(spaces.lockTrashCalls).toHaveLength(1);
  });

  it('refuses a stale version even for a covered descendant', async () => {
    const { tasks, useCase } = fixture();

    const refused = await refusalOf(
      useCase.execute({
        ...request({ type: 'move', listId: BUGS }),
        selection: [
          { taskKey: 'CAD-482', version: 12 },
          { taskKey: 'CAD-483', version: 2 },
        ],
      }),
    );

    expect(refused).toStrictEqual({ reason: 'version-mismatch', version: 1 });
    expect(tasks.stored(CAD_482).version).toBe(12);
    expect(tasks.events).toHaveLength(0);
    expect(tasks.activity.size).toBe(0);
  });

  it('clears values for every task moved to another space inside the batch', async () => {
    const original = fixture();
    const base = await original.tasks.run((store) => Promise.resolve(store.customFields));
    const cleared: string[] = [];
    const customFields = {
      ...base,
      valuesForTasks: (_organizationId: string, _spaceId: string, ids: readonly string[]) =>
        Promise.resolve(
          ids.includes(CAD_483)
            ? [{ taskId: CAD_483, fieldId: '019a7000-0000-7000-8000-000000001001', value: 3 }]
            : [],
        ),
      clearTasks: (_organizationId: string, ids: readonly string[]) => {
        cleared.push(...ids);
        return Promise.resolve();
      },
    };
    const tasks = new InMemoryTasks({ tasks: [taskState(), subtaskState()], customFields });
    const useCase = new BulkTaskAction(
      TRASH_WRITES_ON,
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );

    await useCase.execute(request({ type: 'move', listId: CLOTURES }));

    expect(cleared).toEqual(expect.arrayContaining([CAD_482, CAD_483]));
    expect(tasks.stored(CAD_482).spaceId).toBe(ARCHIVES);
    expect(tasks.stored(CAD_483).spaceId).toBe(ARCHIVES);
    expect(tasks.events).toMatchObject([
      { key: 'CAD-482', changed: ['listId', 'spaceId'] },
      { key: 'CAD-483', changed: ['listId', 'spaceId', 'customFieldValues'] },
    ]);
  });

  it('rechecks source and destination visibility under the placement locks', async () => {
    const { tasks, useCase, spaces } = fixture();
    let held = false;
    let revoked = BUGS;
    const lock = spaces.lockTrashLists.bind(spaces);
    const find = spaces.findVisibleList.bind(spaces);
    vi.spyOn(spaces, 'lockTrashLists').mockImplementation((...args) => {
      held = true;
      return lock(...args);
    });
    vi.spyOn(spaces, 'findVisibleList').mockImplementation((...args) =>
      held && args[2] === revoked ? Promise.resolve(null) : find(...args),
    );

    expect(await refusalOf(useCase.execute(request({ type: 'move', listId: BUGS })))).toStrictEqual(
      {
        reason: 'list-not-found',
      },
    );
    held = false;
    revoked = SPRINT_14;
    expect(
      await refusalOf(useCase.execute(request({ type: 'priority', priority: 'haute' }))),
    ).toStrictEqual({
      reason: 'task-not-found',
    });
    expect(tasks.events).toHaveLength(0);
  });

  it('restarts expansion when a subtask appears while the first task lock waits', async () => {
    const { tasks, members, spaces } = fixture();
    const locks: (readonly string[])[] = [];
    const raced: TasksUnitOfWork = {
      run: (work) =>
        tasks.run((store) =>
          work({
            ...store,
            tasks: {
              ...store.tasks,
              subtreeOf: async (...args) =>
                locks.length === 0
                  ? { taskId: args[1], descendantIds: [], height: 1 }
                  : store.tasks.subtreeOf(...args),
              lockByIds: (organizationId, ids, withChecklists) => {
                locks.push(ids);
                return store.tasks.lockByIds(organizationId, ids, withChecklists);
              },
            },
          }),
        ),
      runReadOnly: (work, snapshot) => tasks.runReadOnly(work, snapshot),
    };
    const useCase = new BulkTaskAction(TRASH_WRITES_ON, raced, members, spaces);

    expect(
      await useCase.execute({
        ...request({ type: 'move', listId: BUGS }),
        selection: [{ taskKey: 'CAD-482' }],
      }),
    ).toStrictEqual({
      affectedCount: 2,
      results: [{ taskKey: 'CAD-482', version: 13 }],
    });
    expect(locks).toEqual([[CAD_482], [CAD_482, CAD_483]]);
    expect(tasks.events.map(({ kind }) => kind)).toEqual(['updated', 'updated']);
  });

  it('leaves versions, activity and outbox unchanged for a no-op', async () => {
    const { tasks, useCase } = fixture();

    expect(await useCase.execute(request({ type: 'move', listId: SPRINT_14 }))).toStrictEqual({
      affectedCount: 0,
      results: selection,
    });
    expect(tasks.events).toHaveLength(0);
    expect(tasks.activity.size).toBe(0);
  });

  it('completes selected descendants independently and counts a recurring successor', async () => {
    const { tasks, useCase } = fixture([
      taskState({
        recurrence: 'monthly',
        dueDate: '2027-01-31',
        startDate: null,
        assigneeIds: [INES, CAMILLE],
      }),
      subtaskState(),
    ]);

    expect(await useCase.execute(request({ type: 'status', status: 'done' }))).toStrictEqual({
      affectedCount: 3,
      results: [
        { taskKey: 'CAD-483', version: 2 },
        { taskKey: 'CAD-482', version: 13, successorKey: 'CAD-496', successorVersion: 1 },
      ],
    });
    expect(tasks.stored(CAD_483).status).toBe('done');
    expect(tasks.stored(CAD_482).nextOccurrenceKey?.format()).toBe('CAD-496');
    expect([...tasks.tasks.values()].find((task) => task.key.format() === 'CAD-496')).toMatchObject(
      {
        assigneeIds: [INES, CAMILLE],
      },
    );
    expect(tasks.events.filter(({ kind }) => kind === 'occurrenceCreated')).toHaveLength(1);
    expect(tasks.events.filter(({ kind }) => kind === 'statusChanged')).toHaveLength(2);
  });

  it('retries a new watcher with the full membership lock set before recording a milestone', async () => {
    const { tasks, members, spaces, trace } = fixture([
      taskState({
        milestone: true,
        status: 'todo',
        estimateMinutes: null,
        dueDate: '2026-11-12',
        startDate: '2026-11-12',
      }),
    ]);
    const list = vi
      .fn<TasksStore['watcherOverrides']['list']>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ userId: HUGO, following: true }]);
    const unit: TasksUnitOfWork = {
      run: (work) =>
        tasks.run((store) =>
          work({
            ...store,
            watcherOverrides: { ...store.watcherOverrides, list },
          }),
        ),
      runReadOnly: (work, snapshot) => tasks.runReadOnly(work, snapshot),
    };
    const useCase = new BulkTaskAction(TRASH_WRITES_ON, unit, members, spaces);

    await useCase.execute({
      ...request({ type: 'status', status: 'done' }),
      selection: [{ taskKey: 'CAD-482', version: 12 }],
    });

    const taskLocks = trace.filter((call) => call === 'tasks.lockByIds');
    expect(taskLocks).toHaveLength(2);
    const watcherLock = trace.indexOf(`members.roleOf:${HUGO}:lock`);
    expect(watcherLock).toBeGreaterThan(trace.indexOf('tasks.lockByIds'));
    expect(watcherLock).toBeLessThan(trace.lastIndexOf('tasks.lockByIds'));
    expect(tasks.events.filter(({ kind }) => kind !== 'updated')).toEqual([
      expect.objectContaining({ kind: 'statusChanged', watcherIds: [CAMILLE, HUGO, INES].sort() }),
      expect.objectContaining({
        kind: 'milestoneReached',
        watcherIds: [CAMILLE, HUGO, INES].sort(),
      }),
    ]);
  });

  it('makes one copy per selected key and keeps the live parent of the copied subtask', async () => {
    const { tasks, useCase } = fixture();

    expect(await useCase.execute(request({ type: 'duplicate' }))).toStrictEqual({
      affectedCount: 2,
      results: [
        { taskKey: 'CAD-483', version: 1, newTaskKey: 'CAD-496', newTaskVersion: 1 },
        { taskKey: 'CAD-482', version: 12, newTaskKey: 'CAD-497', newTaskVersion: 1 },
      ],
    });
    const copies = [...tasks.tasks.values()].slice(2);
    expect(copies.map(({ name, parentId, version }) => [name, parentId, version])).toEqual([
      [subtaskState().name + ' (copie)', CAD_482, 1],
      [taskState().name + ' (copie)', null, 1],
    ]);
    expect(tasks.events.filter(({ kind }) => kind === 'created')).toHaveLength(2);
  });

  it('uses one trash entry for a root and a covered descendant', async () => {
    const { tasks, useCase } = fixture();

    const result = await useCase.execute(request({ type: 'trash' }));

    expect(result.affectedCount).toBe(2);
    expect(tasks.trashEntries.size).toBe(1);
    expect(tasks.jobs).toHaveLength(1);
    const [entryId] = tasks.trashEntries.keys();
    expect(result.results).toStrictEqual([
      { taskKey: 'CAD-483', version: 2, trashEntryId: entryId },
      { taskKey: 'CAD-482', version: 13, trashEntryId: entryId },
    ]);
    expect(tasks.events.map(({ kind, key }) => [kind, key])).toEqual([
      ['trashed', 'CAD-482'],
      ['trashed', 'CAD-483'],
    ]);
  });

  it('answers with the contract 404 when trash writes are disabled without looking up the selection', async () => {
    const { tasks, members, spaces } = fixture();
    const useCase = new BulkTaskAction(TRASH_WRITES_OFF, tasks, members, spaces);

    expect(await refusalOf(useCase.execute(request({ type: 'trash' })))).toStrictEqual({
      reason: 'task-not-found',
    });
    expect(tasks.runs).toBe(0);
  });

  it.each([1000, 1001])('counts distinct tasks against the ceiling (%i rows)', async (total) => {
    const archivedChildren = Array.from({ length: total - 2 }, (_, index): TaskState => {
      const number = 5000 + index;
      const id = `019a7200-0000-7000-8000-${String(number).padStart(12, '0')}`;
      return subtaskState({ id, key: TaskKey.of('CAD', number), archive: archiveFrom(id) });
    });
    const { tasks, useCase } = fixture([taskState(), subtaskState(), ...archivedChildren]);

    const pending = useCase.execute(request({ type: 'trash' }));
    if (total === 1000) {
      const result = await pending;
      expect(result.affectedCount).toBe(1000);
      expect(tasks.trashEntries.size).toBe(1);
      expect(tasks.events).toHaveLength(1000);
      return;
    }
    await expect(pending).rejects.toBeInstanceOf(BulkTaskExpansionError);
    expect(tasks.stored(CAD_482).version).toBe(12);
    expect(tasks.trashEntries.size).toBe(0);
    expect(tasks.events).toHaveLength(0);
    expect(tasks.jobs).toHaveLength(0);
  });

  it('drops earlier changes and the outbox when a later append fails', async () => {
    const { tasks, members, spaces } = fixture();
    let appendAttempts = 0;
    const failing: TasksUnitOfWork = {
      run: (work) =>
        tasks.run((store) =>
          work({
            ...store,
            events: {
              ...store.events,
              taskUpdated: async (...args) => {
                appendAttempts += 1;
                if (appendAttempts === 2) throw new Error('Outbox write failed.');
                await store.events.taskUpdated(...args);
              },
            },
          }),
        ),
      runReadOnly: (work, snapshot) => tasks.runReadOnly(work, snapshot),
    };
    const useCase = new BulkTaskAction(TRASH_WRITES_ON, failing, members, spaces);

    await expect(useCase.execute(request({ type: 'priority', priority: 'basse' }))).rejects.toThrow(
      'Outbox write failed.',
    );
    expect(appendAttempts).toBe(2);
    expect(tasks.stored(CAD_482).version).toBe(12);
    expect(tasks.stored(CAD_483).version).toBe(1);
    expect(tasks.activity.size).toBe(0);
    expect(tasks.events).toHaveLength(0);
  });
});
