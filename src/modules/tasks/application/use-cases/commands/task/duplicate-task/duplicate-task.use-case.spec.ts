import { describe, expect, it, vi } from 'vitest';

import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import { MAX_NAME_LENGTH } from '../../../../../domain/value-objects/task/task-limits.value-object.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TaskRepository } from '../../../../ports/outbound/persistence/task/task-repository.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import {
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  INES,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NADIA,
  NOW,
  SPRINT_14,
  atelierNordMembers,
  queryTask,
  subtaskState,
  taskState,
} from '../../../tasks.fixture.js';
import { DuplicateTask } from './duplicate-task.use-case.js';

function fixture(
  source: TaskState,
  others: readonly TaskState[] = [],
  simulateRace?: (store: TaskRepository) => TaskRepository,
) {
  const trace: string[] = [];
  const tasks = new InMemoryTasks({ tasks: [source, ...others], trace });
  const spaces = new InMemorySpaceDirectory({ trace });
  const transaction: TasksUnitOfWork = {
    run: <Result>(work: (store: TasksStore) => Promise<Result>): Promise<Result> =>
      tasks.run((store: TasksStore): Promise<Result> => {
        const scoped = {
          ...store,
          tasks: simulateRace?.(store.tasks) ?? store.tasks,
          savepoint: async <Value>(attempt: () => Promise<Value>): Promise<Value> => attempt(),
        };
        return work(scoped);
      }),
    runReadOnly: tasks.runReadOnly.bind(tasks),
  };
  const useCase = new DuplicateTask(transaction, atelierNordMembers([INES], trace), spaces);
  return {
    tasks,
    spaces,
    useCase,
    trace,
    input: {
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      taskKey: source.key.format(),
      expectedVersions: [source.version],
    },
  };
}

describe('DuplicateTask', () => {
  it('keeps a live parent and creates ordinary facts with fresh identity, time and checklist', async () => {
    const parent: TaskState = taskState({ checklist: [] });
    const source: TaskState = subtaskState({
      name: '😀'.repeat(MAX_NAME_LENGTH),
      status: 'done',
      completedAt: parent.createdAt,
      milestone: true,
      recurrence: 'weekly',
      startDate: '2026-11-12',
      dueDate: '2026-11-12',
      description: '@Camille stays as Markdown text',
      descriptionMentions: [{ userId: CAMILLE, start: 0, end: 8 }],
      assigneeIds: [CAMILLE, INES, NADIA],
      checklist: taskState().checklist,
    });
    const { useCase, tasks, input, trace } = fixture(source, [parent]);
    const result = await useCase.execute(input);

    expect(result).toMatchObject({
      parentKey: parent.key.format(),
      status: 'done',
      milestone: true,
      recurrence: 'none',
      completedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
      description: source.description,
      descriptionMentions: [],
      assigneeIds: [CAMILLE],
      subtaskCounts: { total: 0, closed: 0 },
      checklist: source.checklist.map(({ text, done }) => ({ text, done })),
    });
    expect(result.key).not.toBe(input.taskKey);
    expect(result.name.endsWith(' (copie)')).toBe(true);
    expect(Array.from(result.name)).toHaveLength(MAX_NAME_LENGTH);
    expect(result.checklist.map(({ id }) => id)).not.toEqual(source.checklist.map(({ id }) => id));
    expect(tasks.stored(source.id)).toEqual(source);
    expect(tasks.events).toMatchObject([
      { kind: 'created', key: result.key, version: 1 },
      { kind: 'assigned', key: result.key, version: 1 },
    ]);
    expect(
      trace.filter((step: string): boolean =>
        ['tasks.lockByIds', 'spaces.lockTrashLists', 'spaces.allocateKeys'].includes(step),
      ),
    ).toEqual(['tasks.lockByIds', 'spaces.lockTrashLists', 'spaces.allocateKeys']);
  });

  it('refuses a full live parent and leaves the outbox empty', async () => {
    const parent: TaskState = taskState();
    const source: TaskState = subtaskState();
    const siblings: TaskState[] = Array.from({ length: 24 }, (_, index: number): TaskState =>
      queryTask(index, { parentId: parent.id, parentKey: parent.key }),
    );
    const { useCase, tasks, input } = fixture(source, [parent, ...siblings]);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      refusal: { reason: 'subtask-limit-reached' },
    });
    expect(tasks.events).toEqual([]);
  });

  it('hides a source whose list access was revoked under the placement lock', async () => {
    const { useCase, tasks, input, spaces } = fixture(taskState());
    spaces.revokedUnderLock.add(SPRINT_14);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      refusal: { reason: 'task-not-found' },
    });
    expect(tasks.events).toEqual([]);
    expect(spaces.allocateCalls).toEqual([]);
  });

  it('restarts discovery when a new assignee appears before the ordered locks', async () => {
    const source: TaskState = taskState({ assigneeIds: [CAMILLE] });
    const after: Task = Task.restore({
      ...source,
      assigneeIds: [CAMILLE, HUGO],
      version: source.version + 1,
    });
    const { useCase, input, trace, tasks } = fixture(source, [], (store: TaskRepository) => ({
      ...store,
      findByKey: vi
        .fn<TaskRepository['findByKey']>()
        .mockResolvedValueOnce(Task.restore(source))
        .mockResolvedValue(after),
      lockByIds: vi.fn<TaskRepository['lockByIds']>().mockImplementation(() => {
        trace.push('tasks.lockByIds');
        return Promise.resolve([after]);
      }),
    }));

    await expect(useCase.execute({ ...input, expectedVersions: null })).resolves.toMatchObject({
      assigneeIds: [CAMILLE, HUGO],
    });
    expect(trace.filter((step: string): boolean => step === 'tasks.lockByIds')).toHaveLength(2);
    expect(tasks.events.filter(({ kind }) => kind === 'created')).toHaveLength(1);
  });
});
