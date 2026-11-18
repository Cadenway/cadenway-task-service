import type { TaskView } from '../../../../projections/task/task-view.projection.js';

/**
 * Type RemoveTaskLabelOutput
 *
 * @description
 * The task after the label was removed; the stored one, at the same version, when it had no such
 * label.
 */
export type RemoveTaskLabelOutput = TaskView;
