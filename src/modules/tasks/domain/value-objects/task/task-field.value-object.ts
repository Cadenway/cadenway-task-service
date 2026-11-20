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
  | 'watchers'
  | 'dependencies'
  | 'approvals'
  | 'milestone'
  | 'recurrence'
  | 'nextOccurrenceKey';

/**
 * Constant TASK_FIELDS
 *
 * @description
 * The task's own fields in aggregate-update order. Watcher and dependency changes have
 * separate write paths.
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
  'milestone',
  'recurrence',
  'nextOccurrenceKey',
]);
