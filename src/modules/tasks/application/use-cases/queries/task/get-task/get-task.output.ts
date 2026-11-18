import type { TaskView } from '../../../../projections/task/task-view.projection.js';

/**
 * Type GetTaskOutput
 *
 * @description
 * The task, with its description, its checklist and the counts of its subtasks.
 */
export type GetTaskOutput = TaskView;
