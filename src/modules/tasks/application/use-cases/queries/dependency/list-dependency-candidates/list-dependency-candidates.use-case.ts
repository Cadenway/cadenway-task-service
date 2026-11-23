import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { ReadonlyTasksStore } from '../../../../models/transactions/readonly-tasks-store.model.js';
import type { DependencyCandidatePage } from '../../../../projections/dependency/dependency-candidate-page.projection.js';
import type { TaskDependencyReads } from '../../../../services/dependency/task-dependency-reads.service.js';
import type { ListDependencyCandidatesInput } from './list-dependency-candidates.input.js';

/** Lists editable possible counterparts without exposing invisible graph paths. */
export class ListDependencyCandidates {
  // #region Constructor
  /** @param reads - Authorized dependency read snapshot. */
  public constructor(private readonly reads: TaskDependencyReads) {}
  // #endregion

  // #region Methods
  /**
   * @param input - The actor, anchor, direction, search and page window.
   * @returns The editable candidate page and scoped total.
   */
  public async execute(input: ListDependencyCandidatesInput): Promise<DependencyCandidatePage> {
    return this.reads.run(
      input,
      true,
      (
        store: ReadonlyTasksStore,
        anchor: Task,
        editableListIds: readonly string[],
      ): Promise<DependencyCandidatePage> =>
        store.dependencies.candidates({
          organizationId: input.organizationId,
          anchorId: anchor.snapshot.id,
          anchorListId: anchor.snapshot.listId,
          editableListIds,
          direction: input.direction,
          search: input.search,
          after: input.after,
          limit: input.limit,
        }),
    );
  }
  // #endregion
}
