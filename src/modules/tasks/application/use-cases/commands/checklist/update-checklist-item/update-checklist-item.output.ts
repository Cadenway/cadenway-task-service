import type { TaskView } from '../../../../projections/task/task-view.projection.js';

/**
 * Type UpdateChecklistItemOutput
 *
 * @description
 * The task after the item was ticked or unticked; the stored one, at the same version, when the
 * item already had that state.
 */
export type UpdateChecklistItemOutput = TaskView;
