import type { TaskDetailCore } from '@cadenway/contracts/types/internal/task-service';

import type { TaskDetailView } from '../../../../application/projections/task/task-detail.projection.js';
import { toPlacedList } from '../placement/placed-list.mapper.js';
import { toPlacedSpace } from '../placement/placed-space.mapper.js';
import { toTaskRef } from './task-reference.mapper.js';
import { toTaskSummary } from './task-summary.mapper.js';
import { toTask } from './task.mapper.js';

/**
 * Function toTaskDetail
 *
 * @description
 * Maps the detail of a task to the `TaskDetailCore` of `openapi/internal/task-service.yaml`: the
 * task, its space and its list as the actor sees them, its parent as a reference (`null` for a
 * top-level task) and its direct subtasks as summaries in the order of their creation. The body
 * has no `version` at the top level: the controller sets the `ETag` from the version of the task.
 *
 * @param {TaskDetailView} view - The task and what the detail screen needs around it.
 * @returns {TaskDetailCore} The detail of the contract.
 */
export function toTaskDetail(view: TaskDetailView): TaskDetailCore {
  return {
    task: toTask(view.task),
    space: toPlacedSpace(view.space),
    list: toPlacedList(view.list),
    parent: view.parent === null ? null : toTaskRef(view.parent),
    subtasks: view.subtasks.map(toTaskSummary),
  };
}
