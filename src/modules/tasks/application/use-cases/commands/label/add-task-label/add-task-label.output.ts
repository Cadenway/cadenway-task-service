import type { TaskView } from '../../../../projections/task/task-view.projection.js';

/**
 * Type AddTaskLabelOutput
 *
 * @description
 * The task after the label was added; the stored one, at the same version, when it already had
 * the label (ignoring case).
 */
export type AddTaskLabelOutput = TaskView;
