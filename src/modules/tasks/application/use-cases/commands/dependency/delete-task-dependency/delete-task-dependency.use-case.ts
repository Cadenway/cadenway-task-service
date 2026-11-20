import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { DependencyEdge } from '../../../../models/dependency/dependency-edge.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskLocation } from '../../../../projections/task/task-location.projection.js';
import type { TaskDependencyMutations } from '../../../../services/dependency/task-dependency-mutations.service.js';
import type { DeleteTaskDependencyInput } from './delete-task-dependency.input.js';
import type { DeleteTaskDependencyOutput } from './delete-task-dependency.output.js';

/** Removes an existing edge from either authorized endpoint. */
export class DeleteTaskDependency {
  // #region Constructor
  /**
   * @param unitOfWork - The tenant transaction for the deletion and its effects.
   * @param mutations - Shared dependency write locks and change recording.
   */
  public constructor(
    private readonly unitOfWork: TasksUnitOfWork,
    private readonly mutations: TaskDependencyMutations,
  ) {}
  // #endregion

  // #region Methods
  /**
   * @param input - The actor, anchor version requirement and dependency id.
   * @returns The resulting anchor version.
   */
  public async execute(input: DeleteTaskDependencyInput): Promise<DeleteTaskDependencyOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<DeleteTaskDependencyOutput> => {
      const { organizationId, dependencyId, expectedVersions } = input;
      const { viewer, anchor } = await this.mutations.anchor(store, input);
      const anchorId: string = anchor.task.snapshot.id;
      const found: DependencyEdge = await this.find(store, organizationId, anchorId, dependencyId);
      const anchorBlocks: boolean = found.blockerId === anchorId;
      const counterpartId: string = anchorBlocks ? found.blockedId : found.blockerId;
      const [location]: readonly TaskLocation[] = await store.reader.locationsByIds(
        organizationId,
        [counterpartId],
      );
      if (location === undefined) throw new TaskRefusal({ reason: 'dependency-not-found' });
      const other: LocatedTask = await this.mutations.counterpart(
        store,
        { ...input, taskKey: location.key },
        viewer,
        'dependency-not-found',
      );
      await store.dependencies.lockGraph(organizationId);
      const edge: DependencyEdge = await this.find(store, organizationId, anchorId, dependencyId);
      const locked = await this.mutations.hold(
        store,
        input,
        viewer,
        anchor,
        other,
        expectedVersions,
        'dependency-not-found',
      );
      const blocker: Task = anchorBlocks ? locked.anchor : locked.other;
      const blocked: Task = anchorBlocks ? locked.other : locked.anchor;
      await store.dependencies.remove(organizationId, edge);
      const version: number = await this.mutations.recordChange(
        store,
        'removed',
        edge.id,
        blocker,
        blocked,
        viewer,
        anchorId,
      );
      return { version };
    });
  }

  /**
   * @param store - The tenant transaction.
   * @param organizationId - Verified organization.
   * @param anchorId - Id of the path task.
   * @param dependencyId - Id of the requested edge.
   * @returns The edge when it belongs to this anchor.
   */
  private async find(
    store: TasksStore,
    organizationId: string,
    anchorId: string,
    dependencyId: string,
  ): Promise<DependencyEdge> {
    const edge: DependencyEdge | null = await store.dependencies.findEdge(
      organizationId,
      anchorId,
      dependencyId,
    );
    if (edge === null) throw new TaskRefusal({ reason: 'dependency-not-found' });
    return edge;
  }
  // #endregion
}
