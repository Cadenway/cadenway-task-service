import { describe, expect, it, vi } from 'vitest';

import type { DependencyEdge } from '../../../../models/dependency/dependency-edge.model.js';
import type { TaskDependencyRepository } from '../../../../ports/outbound/persistence/dependency/task-dependency-repository.port.js';
import { TaskDependencyMutations } from '../../../../services/dependency/task-dependency-mutations.service.js';
import {
  ATELIER_NORD,
  BUGS,
  CAMILLE,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NOW,
  SPRINT_14,
  atelierNordMembers,
  cad490State,
  summaryOf,
  taskState,
} from '../../../tasks.fixture.js';
import { DeleteTaskDependency } from '../delete-task-dependency/delete-task-dependency.use-case.js';
import type { CreateTaskDependencyInput } from './create-task-dependency.input.js';
import { CreateTaskDependency } from './create-task-dependency.use-case.js';

/** Creates two live editable tasks and a traced graph adapter. */
function fixture() {
  const trace: string[] = [];
  const anchor = taskState();
  const other = cad490State({ listId: BUGS, version: 3 });
  const edge: DependencyEdge = {
    id: '019b0000-0000-7000-8000-000000000001',
    blockerId: other.id,
    blockedId: anchor.id,
    createdAt: NOW,
  };
  const graph = {
    lockGraph: vi.fn<TaskDependencyRepository['lockGraph']>(() => {
      trace.push('dependencies.lockGraph');
      return Promise.resolve();
    }),
    findEdge: vi.fn<TaskDependencyRepository['findEdge']>().mockResolvedValue(edge),
    inspect: vi.fn<TaskDependencyRepository['inspect']>().mockResolvedValue({
      duplicate: false,
      cycle: false,
      limitReached: false,
    }),
    insert: vi.fn<TaskDependencyRepository['insert']>().mockResolvedValue(edge),
    remove: vi.fn<TaskDependencyRepository['remove']>().mockResolvedValue(undefined),
    get: vi.fn<TaskDependencyRepository['get']>().mockResolvedValue({
      id: edge.id,
      blocker: summaryOf(other, { total: 0, closed: 0 }),
      blocked: summaryOf(anchor, { total: 0, closed: 0 }),
    }),
    page: vi.fn<TaskDependencyRepository['page']>(),
    candidates: vi.fn<TaskDependencyRepository['candidates']>(),
  } satisfies TaskDependencyRepository;
  const tasks = new InMemoryTasks({ tasks: [anchor, other], trace, dependencies: graph });
  const spaces = new InMemorySpaceDirectory({ trace });
  const mutations = new TaskDependencyMutations(atelierNordMembers([], trace), spaces);
  const input: CreateTaskDependencyInput = {
    organizationId: ATELIER_NORD,
    actorUserId: CAMILLE,
    taskKey: anchor.key.format(),
    otherTaskKey: other.key.format(),
    direction: 'blocked-by',
    expectedVersions: [anchor.version],
  };
  return {
    anchor,
    other,
    spaces,
    trace,
    graph,
    edge,
    input,
    create: new CreateTaskDependency(tasks, mutations),
    remove: new DeleteTaskDependency(tasks, mutations),
    tasks,
  };
}

describe('dependency writes', () => {
  it('orients the edge from the other task and locks its graph before its endpoints and placements', async () => {
    const { anchor, other, graph, trace, tasks, edge, input, create } = fixture();
    await expect(create.execute(input)).resolves.toMatchObject({
      version: anchor.version + 1,
      dependency: { id: edge.id },
    });
    expect(graph.inspect).toHaveBeenCalledWith(ATELIER_NORD, other.id, anchor.id);
    expect(graph.insert).toHaveBeenCalledWith(ATELIER_NORD, other.id, anchor.id);
    expect(
      trace.filter((step: string): boolean =>
        ['dependencies.lockGraph', 'tasks.lockByIds', 'spaces.lockTrashLists'].includes(step),
      ),
    ).toEqual(['dependencies.lockGraph', 'tasks.lockByIds', 'spaces.lockTrashLists']);
    expect(tasks.stored(anchor.id).version).toBe(anchor.version + 1);
    expect(tasks.stored(other.id).version).toBe(other.version + 1);
    expect(tasks.events).toMatchObject([
      { kind: 'updated', key: other.key.format(), changed: ['dependencies'] },
      { kind: 'updated', key: anchor.key.format(), changed: ['dependencies'] },
      {
        kind: 'dependencyChanged',
        dependencyId: edge.id,
        action: 'added',
        key: other.key.format(),
        version: other.version + 1,
        blockedKey: anchor.key.format(),
        blockedVersion: anchor.version + 1,
      },
    ]);
  });

  it('hides a counterpart whose list role disappeared while waiting for locks', async () => {
    const { graph, spaces, tasks, input, create } = fixture();
    spaces.revokedUnderLock.add(BUGS);
    await expect(create.execute(input)).rejects.toMatchObject({
      refusal: { reason: 'task-not-found' },
    });
    expect(graph.inspect).not.toHaveBeenCalled();
    expect(graph.insert).not.toHaveBeenCalled();
    expect(tasks.events).toEqual([]);
  });

  it('rejects a cycle without exposing a path or changing either task', async () => {
    const { anchor, other, graph, tasks, input, create } = fixture();
    graph.inspect.mockResolvedValue({ duplicate: false, cycle: true, limitReached: false });
    await expect(create.execute(input)).rejects.toMatchObject({
      refusal: { reason: 'dependency-cycle' },
    });
    expect(graph.insert).not.toHaveBeenCalled();
    expect(tasks.stored(anchor.id).version).toBe(anchor.version);
    expect(tasks.stored(other.id).version).toBe(other.version);
    expect(tasks.events).toEqual([]);
  });

  it('checks the current anchor version before graph validation', async () => {
    const { anchor, graph, input, create } = fixture();
    await expect(
      create.execute({ ...input, expectedVersions: [anchor.version - 1] }),
    ).rejects.toMatchObject({
      refusal: { reason: 'version-mismatch', version: anchor.version },
    });
    expect(graph.inspect).not.toHaveBeenCalled();
  });

  it('supports removal from the blocked anchor and checks both current list roles', async () => {
    const { anchor, graph, tasks, spaces, edge, input, remove } = fixture();
    await expect(remove.execute({ ...input, dependencyId: edge.id })).resolves.toEqual({
      version: anchor.version + 1,
    });
    expect(graph.remove).toHaveBeenCalledWith(ATELIER_NORD, edge);
    expect(spaces.lockTrashCalls).toMatchObject([
      { listIds: [BUGS, SPRINT_14].sort(), mode: 'hold' },
    ]);
    expect(tasks.events.at(-1)).toMatchObject({
      kind: 'dependencyChanged',
      action: 'removed',
      dependencyId: edge.id,
    });
  });
});
