/**
 * Type TaskField
 *
 * @description
 * A member of a task a change may change, the names `changed` of `task.updated.v1` lists today
 * (`asyncapi/task-service.yaml:922-924`). `completedAt` is never named: it follows from the status.
 *
 * @type {'name' | 'description' | 'status' | 'cancelReason' | 'cancelNote' | 'priority' | 'assigneeIds' | 'dueDate' | 'startDate' | 'estimateMinutes' | 'labels' | 'listId' | 'spaceId' | 'parentKey' | 'checklist' | 'dependencies' | 'milestone' | 'recurrence' | 'nextOccurrenceKey'}
 */
export type TaskField =
  | 'name'
  | 'description'
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
  | 'dependencies'
  | 'milestone'
  | 'recurrence'
  | 'nextOccurrenceKey';

/**
 * Constant TASK_FIELDS
 *
 * @description
 * The task's own fields in the order used to assemble an aggregate update.
 *
 * @type {readonly TaskField[]}
 */
export const TASK_FIELDS: readonly TaskField[] = Object.freeze([
  'name',
  'description',
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
