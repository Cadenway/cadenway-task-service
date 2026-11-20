import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { DependencyPageView } from '../../../../projections/dependency/dependency-page.projection.js';
import type { TaskDependencyReads } from '../../../../services/dependency/task-dependency-reads.service.js';
import type { ListTaskDependenciesInput } from './list-task-dependencies.input.js';

/** Pages the task's visible dependency edges. */
export class ListTaskDependencies {
  // #region Constructor
  /** @param reads - Authorized dependency read snapshot. */
  public constructor(private readonly reads: TaskDependencyReads) {}
  // #endregion

  // #region Methods
  /**
   * @param input - The actor, anchor key and page window.
   * @returns The visible dependency page.
   */
  public async execute(input: ListTaskDependenciesInput): Promise<DependencyPageView> {
    return this.reads.run(
      input,
      false,
      (store: TasksStore, anchor: Task, listIds: readonly string[]): Promise<DependencyPageView> =>
        store.dependencies.page(
          input.organizationId,
          anchor.snapshot.id,
          listIds,
          input.after,
          input.limit,
        ),
    );
  }
  // #endregion
}
