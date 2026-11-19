import type { TaskLocation } from '../../../../projections/task/task-location.projection.js';

/**
 * Type FindTaskReferenceOutput
 *
 * @description
 * The task, or `null` when the organization has no task with this key.
 *
 * @type {TaskLocation | null}
 */
export type FindTaskReferenceOutput = TaskLocation | null;
