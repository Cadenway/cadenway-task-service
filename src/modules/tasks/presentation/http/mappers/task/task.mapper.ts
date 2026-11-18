import type { Task } from '@cadenway/contracts/types/internal/task-service';

import type { TaskView } from '../../../../application/projections/task/task-view.projection.js';

/**
 * Function toTask
 *
 * @description
 * Maps a task of the use cases to the `Task` of `openapi/internal/task-service.yaml`: each assignee
 * as `{ userId }` in the order of the assignment, the checklist in the order of its items, the
 * instants in ISO 8601 and the creator as `{ type, id }`. The id and the organization of the task
 * are not part of the contract and do not leave the service. The body carries the `version`, which
 * the `EtagInterceptor` of the kit turns into the `ETag` of the response.
 *
 * @param {TaskView} view - The task, with its counts.
 * @returns {Task} The task of the contract.
 */
export function toTask(view: TaskView): Task {
  return {
    key: view.key,
    name: view.name,
    description: view.description,
    status: view.status,
    cancelReason: view.cancelReason,
    cancelNote: view.cancelNote,
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
    checklist: view.checklist.map((item) => ({ id: item.id, text: item.text, done: item.done })),
    checklistCounts: { total: view.checklistCounts.total, done: view.checklistCounts.done },
    completedAt: view.completedAt === null ? null : view.completedAt.toISOString(),
    createdAt: view.createdAt.toISOString(),
    createdBy: { type: view.createdBy.type, id: view.createdBy.id },
    updatedAt: view.updatedAt.toISOString(),
    version: view.version,
  };
}
