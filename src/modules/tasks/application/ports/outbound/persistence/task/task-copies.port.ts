import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { ChecklistItemState } from '../../../../../domain/value-objects/task/checklist-item-state.value-object.js';

/** Reads and writes the task data needed only by duplication, in the caller's tenant transaction. */
export interface TaskCopies {
  // #region Methods
  /** Reads a bounded snapshot of the live source forest with all copied collections. */
  listSources(organizationId: string, listId: string, limit: number): Promise<readonly Task[]>;

  /** Adds a freshly created task's initial checklist with new identities and existing ticks. */
  insertChecklist(task: Task, source: readonly ChecklistItemState[]): Promise<Task>;

  /** Inserts several initial checklists and returns the tasks in the supplied order. */
  insertChecklists(
    tasks: readonly Task[],
    sources: readonly (readonly ChecklistItemState[])[],
  ): Promise<readonly Task[]>;
  // #endregion
}
