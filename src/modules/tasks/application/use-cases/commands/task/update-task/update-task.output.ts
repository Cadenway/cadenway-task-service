import type { TaskView } from '../../../../projections/task/task-view.projection.js';

/**
 * Type UpdateTaskOutput
 *
 * @description
 * The task after the patch; the stored one, at the same version, when the patch changed nothing.
 */
export type UpdateTaskOutput = TaskView;
