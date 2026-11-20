import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { dependencyRefusal } from '../../../../../domain/policies/dependency/dependency-graph.policy.js';
import type { DependencyEdge } from '../../../../models/dependency/dependency-edge.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { DependencyView } from '../../../../projections/dependency/dependency.projection.js';
import type { TaskDependencyMutations } from '../../../../services/dependency/task-dependency-mutations.service.js';
import type { CreateTaskDependencyInput } from './create-task-dependency.input.js';
import type { CreateTaskDependencyOutput } from './create-task-dependency.output.js';

/** Creates one dependency atomically with both task versions and their outbox facts. */
export class CreateTaskDependency {
  // #region Constructor
  /**
   * @param unitOfWork - The tenant transaction for the edge and both tasks.
   * @param mutations - Shared dependency write locks and change recording.
   */
  public constructor(
    private readonly unitOfWork: TasksUnitOfWork,
    private readonly mutations: TaskDependencyMutations,
  ) {}
  // #endregion

  // #region Methods
  /**
   * @param input - The authorized request, counterpart key and orientation.
   * @returns The created edge and resulting anchor version.
   */
  public async execute(input: CreateTaskDependencyInput): Promise<CreateTaskDependencyOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<CreateTaskDependencyOutput> => {
      const { organizationId, expectedVersions } = input;
      const { viewer, anchor } = await this.mutations.anchor(store, input);
      const other: LocatedTask = await this.mutations.counterpart(
        store,
        { ...input, taskKey: input.otherTaskKey },
        viewer,
        'task-not-found',
      );
      await store.dependencies.lockGraph(organizationId);
      const locked = await this.mutations.hold(
        store,
        input,
        viewer,
        anchor,
        other,
        expectedVersions,
        'task-not-found',
      );
      const blocker: Task = input.direction === 'blocks' ? locked.anchor : locked.other;
      const blocked: Task = input.direction === 'blocks' ? locked.other : locked.anchor;
      const blockerId: string = blocker.snapshot.id;
      const blockedId: string = blocked.snapshot.id;
      const check = await store.dependencies.inspect(organizationId, blockerId, blockedId);
      const reason = dependencyRefusal(blockerId, blockedId, check);
      if (reason !== null) throw new TaskRefusal({ reason });
      const edge: DependencyEdge = await store.dependencies.insert(
        organizationId,
        blockerId,
        blockedId,
      );
      const anchorId: string = locked.anchor.snapshot.id;
      const version: number = await this.mutations.recordChange(
        store,
        'added',
        edge.id,
        blocker,
        blocked,
        viewer,
        anchorId,
      );
      const dependency: DependencyView | null = await store.dependencies.get(
        organizationId,
        anchorId,
        edge.id,
        [blocker.snapshot.listId, blocked.snapshot.listId],
      );
      if (dependency === null)
        throw new Error('The new dependency is missing from its transaction.');
      return { dependency, version };
    });
  }
  // #endregion
}
