import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { DependencyView } from '../../../../projections/dependency/dependency.projection.js';
import type { TaskDependencyReads } from '../../../../services/dependency/task-dependency-reads.service.js';
import type { GetTaskDependencyInput } from './get-task-dependency.input.js';

/** Reads an edge only when its anchor and live counterpart are visible. */
export class GetTaskDependency {
  // #region Constructor
  /** @param reads - Authorized dependency read snapshot. */
  public constructor(private readonly reads: TaskDependencyReads) {}
  // #endregion

  // #region Methods
  /**
   * @param input - Actor, path task key and edge id.
   * @returns The visible dependency.
   */
  public async execute(input: GetTaskDependencyInput): Promise<DependencyView> {
    return this.reads.run(
      input,
      false,
      async (
        store: TasksStore,
        anchor: Task,
        listIds: readonly string[],
      ): Promise<DependencyView> => {
        const edge: DependencyView | null = await store.dependencies.get(
          input.organizationId,
          anchor.snapshot.id,
          input.dependencyId,
          listIds,
        );
        if (edge === null) throw new TaskRefusal({ reason: 'dependency-not-found' });
        return edge;
      },
    );
  }
  // #endregion
}
