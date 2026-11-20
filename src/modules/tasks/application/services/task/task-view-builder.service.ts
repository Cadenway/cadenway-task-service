import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { showsParent } from '../../../domain/policies/subtask/subtask-tree.policy.js';
import type { ChecklistItemState } from '../../../domain/value-objects/task/checklist-item-state.value-object.js';
import type { TaskState } from '../../../domain/value-objects/task/task-state.value-object.js';
import type { TaskReader } from '../../ports/outbound/persistence/task/task-reader.port.js';
import type { ChecklistItemView } from '../../projections/task/checklist-item-view.projection.js';
import type { SubtaskCounts } from '../../projections/task/subtask-counts.projection.js';
import type { TaskReferenceInListView } from '../../projections/task/task-reference-in-list.projection.js';
import type { TaskView } from '../../projections/task/task-view.projection.js';

/**
 * Class TaskViewBuilder
 *
 * @description
 * Builds the read model of a task: the state of the aggregate with the counts of its direct
 * subtasks, which are derived and not stored (those of the same archive as the task: its live
 * subtasks for a live task, the subtasks archived with it for an archived one). The checklist
 * counts come from the checklist itself; the archive gives `archivedAt` and `archivedBy`. The
 * parent key is the one the task reads with (`showsParent`): an archived root whose live parent
 * moved to another list since, or whose parent is in the trash, reads as detached,
 * `parentKey: null`, in every answer that builds its view (`GET /tasks/{taskKey}`, the detail, the
 * archive and the restorations); the stored link is kept for the restoration.
 */
export class TaskViewBuilder {
  // #region Methods
  /**
   * Method build
   *
   * @description
   * Reads the subtask counts in the transaction that holds the task and, for an archived task with
   * a parent, the list that parent is in now, then builds the view. A live task always shares the
   * list of its parent (a move carries the live subtree), so nothing more is read for it.
   *
   * @param {TaskReader} reader - The read side of the transaction.
   * @param {Task} task - The task, as stored.
   * @param {TaskReferenceInListView | null} [parent] - The parent of the task as the caller
   * already read it in the same transaction, `null` when the task has none or it was not found;
   * left out, it is read when the view needs it.
   * @returns {Promise<TaskView>} The view.
   */
  public async build(
    reader: TaskReader,
    task: Task,
    parent?: TaskReferenceInListView | null,
  ): Promise<TaskView> {
    const { id, organizationId } = task.snapshot;
    const counts: ReadonlyMap<string, SubtaskCounts> = await reader.subtaskCounts(organizationId, [
      id,
    ]);
    const parentKey: string | null = await this.parentKeyOf(reader, task, parent);
    return this.toView(task.snapshot, counts.get(id) ?? { total: 0, closed: 0 }, parentKey);
  }

  /**
   * Method parentKeyOf
   *
   * @description
   * The key of the parent the task reads with: its parent's for a live subtask; for an archived
   * one, its parent's only when the parent is in its list and not in the trash (`showsParent`),
   * `null` otherwise, as for a top-level task. A live task always has a live parent (a deletion
   * takes the live subtree with it), so nothing is read for it.

   *
   * @param {TaskReader} reader - The read side of the transaction.
   * @param {Task} task - The task.
   * @param {TaskReferenceInListView | null | undefined} parent - The parent as the caller read it,
   * or `undefined` to read it here.
   * @returns {Promise<string | null>} The key, as `CAD-482`, or `null`.
   */
  private async parentKeyOf(
    reader: TaskReader,
    task: Task,
    parent: TaskReferenceInListView | null | undefined,
  ): Promise<string | null> {
    const { organizationId, parentId, parentKey, listId } = task.snapshot;
    if (parentId === null || parentKey === null) {
      return null;
    }
    if (task.isLive) {
      return parentKey.format();
    }
    const reference: TaskReferenceInListView | null | undefined =
      parent === undefined
        ? (await reader.references(organizationId, [parentId])).get(parentId)
        : parent;
    return reference !== undefined &&
      reference !== null &&
      showsParent(listId, reference.listId, reference.inTrash)
      ? parentKey.format()
      : null;
  }

  /**
   * Method toView
   *
   * @description
   * Maps the state of a task to its view.
   *
   * @param {TaskState} state - The state.
   * @param {SubtaskCounts} subtaskCounts - Its direct subtasks.
   * @param {string | null} parentKey - The key of the parent it reads with (`parentKeyOf`).
   * @returns {TaskView} The view.
   */
  private toView(
    state: TaskState,
    subtaskCounts: SubtaskCounts,
    parentKey: string | null,
  ): TaskView {
    return {
      id: state.id,
      key: state.key.format(),
      name: state.name,
      status: state.status,
      cancelReason: state.cancelReason,
      description: state.description,
      descriptionMentions: state.descriptionMentions,
      cancelNote: state.cancelNote,
      priority: state.priority,
      assigneeIds: state.assigneeIds,
      dueDate: state.dueDate,
      startDate: state.startDate,
      estimateMinutes: state.estimateMinutes,
      ...(state.milestone === undefined ? {} : { milestone: state.milestone }),
      ...(state.recurrence === undefined ? {} : { recurrence: state.recurrence }),
      labels: state.labels,
      parentKey,
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
      archivedAt: state.archive === null ? null : state.archive.at,
      archivedBy: state.archive === null ? null : state.archive.by,
    };
  }
  // #endregion
}
