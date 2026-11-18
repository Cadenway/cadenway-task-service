import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { ChecklistCounts } from '../../../../../application/projections/task/checklist-counts.projection.js';
import type { SubtaskCounts } from '../../../../../application/projections/task/subtask-counts.projection.js';
import type { TaskReferenceView } from '../../../../../application/projections/task/task-reference.projection.js';
import type { TaskSummaryView } from '../../../../../application/projections/task/task-summary.projection.js';
import type { TaskRow } from './task.mapper.js';
import { toCancelReason, toPriorityKey, toStatusKey } from './task-values.mapper.js';

/**
 * Type TaskSummaryRow
 *
 * @description
 * The columns of a row of `tasks` a summary reads: everything but the organization, the
 * description, the note of the cancellation and the author. A page of tasks selects only these.
 *
 * @type {Pick<TaskRow, 'id' | 'keyPrefix' | ...>}
 */
export type TaskSummaryRow = Pick<
  TaskRow,
  | 'id'
  | 'keyPrefix'
  | 'keyNumber'
  | 'name'
  | 'status'
  | 'cancelReason'
  | 'priority'
  | 'dueDate'
  | 'startDate'
  | 'estimateMinutes'
  | 'completedAt'
  | 'createdAt'
  | 'listId'
  | 'spaceId'
  | 'parentId'
  | 'version'
>;

/**
 * Function toTaskKeyText
 *
 * @description
 * Formats a stored key as `CAD-482`, checking the stored parts.
 *
 * @param {string} prefix - The stored prefix.
 * @param {number} number - The stored number.
 * @returns {string} The key.
 * @throws {InvalidTaskError} When the parts are not a key.
 */
export function toTaskKeyText(prefix: string, number: number): string {
  return TaskKey.of(prefix, number).format();
}

/**
 * Function toTaskSummary
 *
 * @description
 * Maps a row and what was loaded for it to the summary of a task: everything but the description,
 * the note of the cancellation and the items of the checklist.
 *
 * @param {TaskSummaryRow} row - The row.
 * @param {string | null} parentKey - The key of the parent, `null` for a top-level task.
 * @param {readonly string[]} assigneeIds - The assignees in the order of assignment.
 * @param {readonly string[]} labels - The labels in the order of addition.
 * @param {SubtaskCounts} subtaskCounts - The direct subtasks and the closed ones.
 * @param {ChecklistCounts} checklistCounts - The checklist items and the ticked ones.
 * @returns {TaskSummaryView} The summary.
 * @throws {Error} When a stored status, priority or reason is outside its set.
 */
export function toTaskSummary(
  row: TaskSummaryRow,
  parentKey: string | null,
  assigneeIds: readonly string[],
  labels: readonly string[],
  subtaskCounts: SubtaskCounts,
  checklistCounts: ChecklistCounts,
): TaskSummaryView {
  const subject: string = `task ${row.id}`;
  return {
    id: row.id,
    key: toTaskKeyText(row.keyPrefix, row.keyNumber),
    name: row.name,
    status: toStatusKey(row.status, subject),
    cancelReason: toCancelReason(row.cancelReason, subject),
    priority: toPriorityKey(row.priority, subject),
    assigneeIds,
    dueDate: row.dueDate,
    startDate: row.startDate,
    estimateMinutes: row.estimateMinutes,
    labels,
    parentKey,
    listId: row.listId,
    spaceId: row.spaceId,
    subtaskCounts,
    checklistCounts,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    version: row.version,
  };
}

/**
 * Function toTaskReference
 *
 * @description
 * Maps the key, the name and the status of a stored task to the reference other resources show.
 *
 * @param {Pick<TaskRow, 'keyPrefix' | 'keyNumber' | 'name' | 'status'>} row - The columns.
 * @returns {TaskReferenceView} The reference.
 * @throws {Error} When the stored status is outside the status keys.
 */
export function toTaskReference(
  row: Pick<TaskRow, 'keyPrefix' | 'keyNumber' | 'name' | 'status'>,
): TaskReferenceView {
  const key: string = toTaskKeyText(row.keyPrefix, row.keyNumber);
  return {
    key,
    name: row.name,
    status: toStatusKey(row.status, `task ${key}`),
  };
}
