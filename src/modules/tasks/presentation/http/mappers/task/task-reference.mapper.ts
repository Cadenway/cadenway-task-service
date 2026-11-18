import type { TaskRef } from '@cadenway/contracts/types/internal/task-service';

import type { TaskReferenceView } from '../../../../application/projections/task/task-reference.projection.js';

/**
 * Function toTaskRef
 *
 * @description
 * Maps the reference to a task, its key, name and status as they are now, to the `TaskRef` of
 * `openapi/internal/task-service.yaml`.
 *
 * @param {TaskReferenceView} view - The reference.
 * @returns {TaskRef} The reference of the contract.
 */
export function toTaskRef(view: TaskReferenceView): TaskRef {
  return { key: view.key, name: view.name, status: view.status };
}
