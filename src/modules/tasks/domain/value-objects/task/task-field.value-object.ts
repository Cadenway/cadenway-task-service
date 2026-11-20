/**
 * Type TaskField
 *
 * @description
 * A field named by `changed` in `task.updated.v1`.
 * `completedAt` follows from the status and has no separate entry.
 */
export type TaskField =
  | 'name'
  | 'description'
  | 'descriptionMentions'
  | 'status'
  | 'cancelReason'
  | 'cancelNote'
  | 'priority'
  | 'assigneeIds'
  | 'dueDate'
  | 'startDate'
  | 'estimateMinutes'
  | 'labels'
  | 'listId'
  | 'spaceId'
  | 'parentKey'
  | 'checklist'
  | 'watchers';

/**
 * Constant TASK_FIELDS
 *
 * @description
 * The ordered fields changed by the task aggregate. Watcher overrides have their own write path.
 *
 * @type {readonly TaskField[]}
 */
export const TASK_FIELDS: readonly TaskField[] = Object.freeze([
  'name',
  'description',
  'descriptionMentions',
  'status',
  'cancelReason',
  'cancelNote',
  'priority',
  'assigneeIds',
  'dueDate',
  'startDate',
  'estimateMinutes',
  'labels',
  'listId',
  'spaceId',
  'parentKey',
  'checklist',
]);
