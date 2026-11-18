import type { TaskSummary } from '@cadenway/contracts/types/internal/task-service';

import type { TaskSummaryView } from '../../../../application/projections/task/task-summary.projection.js';

/**
 * Function toTaskSummary
 *
 * @description
 * Maps a task of a page or of the detail of a task to the `TaskSummary` of
 * `openapi/internal/task-service.yaml`: the task without its description, its cancel note, its
 * checklist and its author. The id of the task does not leave the service.
 *
 * @param {TaskSummaryView} view - The task, with its counts.
 * @returns {TaskSummary} The summary of the contract.
 */
export function toTaskSummary(view: TaskSummaryView): TaskSummary {
  return {
    key: view.key,
    name: view.name,
    status: view.status,
    cancelReason: view.cancelReason,
    priority: view.priority,
    assignees: view.assigneeIds.map((userId: string) => ({ userId })),
    dueDate: view.dueDate,
    startDate: view.startDate,
    estimateMinutes: view.estimateMinutes,
    labels: [...view.labels],
    parentKey: view.parentKey,
    listId: view.listId,
    spaceId: view.spaceId,
    subtaskCounts: { total: view.subtaskCounts.total, closed: view.subtaskCounts.closed },
    checklistCounts: { total: view.checklistCounts.total, done: view.checklistCounts.done },
    completedAt: view.completedAt === null ? null : view.completedAt.toISOString(),
    createdAt: view.createdAt.toISOString(),
    version: view.version,
  };
}
