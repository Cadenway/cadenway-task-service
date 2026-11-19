import type { TaskReference } from '../../models/task/task-reference.model.js';

/**
 * Type RequestedTask
 *
 * @description
 * The task of a task request as the people who manage its list read it (`TaskRef` of
 * `openapi/internal/task-service.yaml`): its key, and its name and status as they are now.
 *
 * @type {Pick<TaskReference, 'key' | 'name' | 'status'>}
 */
export type RequestedTask = Pick<TaskReference, 'key' | 'name' | 'status'>;
