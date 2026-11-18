import type { TaskView } from '../../../../projections/task/task-view.projection.js';

/**
 * Type AssignTaskOutput
 *
 * @description
 * The task after the assignment; the stored one, at the same version, when the account was
 * already assigned.
 */
export type AssignTaskOutput = TaskView;
