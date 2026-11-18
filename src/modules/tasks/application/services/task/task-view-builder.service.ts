import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { ChecklistItemState } from '../../../domain/value-objects/task/checklist-item-state.value-object.js';
import type { TaskState } from '../../../domain/value-objects/task/task-state.value-object.js';
import type { TaskReader } from '../../ports/outbound/persistence/task/task-reader.port.js';
import type { ChecklistItemView } from '../../projections/task/checklist-item-view.projection.js';
import type { SubtaskCounts } from '../../projections/task/subtask-counts.projection.js';
import type { TaskView } from '../../projections/task/task-view.projection.js';

/**
 * Class TaskViewBuilder
 *
 * @description
 * Builds the read model of a task: the state of the aggregate with the counts of its direct
 * subtasks, which are derived and not stored. The checklist counts come from the checklist itself.
 */
export class TaskViewBuilder {
  // #region Methods
  /**
   * Method build
   *
   * @description
   * Reads the subtask counts in the transaction that holds the task, then builds the view.
   *
   * @param {TaskReader} reader - The read side of the transaction.
   * @param {Task} task - The task, as stored.
   * @returns {Promise<TaskView>} The view.
   */
  public async build(reader: TaskReader, task: Task): Promise<TaskView> {
    const { id, organizationId } = task.snapshot;
    const counts: ReadonlyMap<string, SubtaskCounts> = await reader.subtaskCounts(organizationId, [
      id,
    ]);
    return this.toView(task.snapshot, counts.get(id) ?? { total: 0, closed: 0 });
  }

  /**
   * Method toView
   *
   * @description
   * Maps the state of a task to its view.
   *
   * @param {TaskState} state - The state.
   * @param {SubtaskCounts} subtaskCounts - Its direct subtasks.
   * @returns {TaskView} The view.
   */
  public toView(state: TaskState, subtaskCounts: SubtaskCounts): TaskView {
    return {
      id: state.id,
      key: state.key.format(),
      name: state.name,
      status: state.status,
      cancelReason: state.cancelReason,
      description: state.description,
      cancelNote: state.cancelNote,
      priority: state.priority,
      assigneeIds: state.assigneeIds,
      dueDate: state.dueDate,
      startDate: state.startDate,
      estimateMinutes: state.estimateMinutes,
      labels: state.labels,
      parentKey: state.parentKey === null ? null : state.parentKey.format(),
      listId: state.listId,
      spaceId: state.spaceId,
      subtaskCounts,
      checklistCounts: {
        total: state.checklist.length,
        done: state.checklist.filter((item: ChecklistItemState): boolean => item.done).length,
      },
      completedAt: state.completedAt,
      createdAt: state.createdAt,
      version: state.version,
      checklist: state.checklist.map((item: ChecklistItemState): ChecklistItemView => ({
        id: item.id,
        text: item.text,
        done: item.done,
      })),
      createdBy: state.createdBy,
      updatedAt: state.updatedAt,
    };
  }
  // #endregion
}
