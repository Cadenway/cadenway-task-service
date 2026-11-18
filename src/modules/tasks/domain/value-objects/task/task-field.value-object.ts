/**
 * Type TaskField
 *
 * @description
 * A member of a task a change may change, the names `changed` of `task.updated.v1` lists today
 * (`asyncapi/task-service.yaml:922-924`). `completedAt` is never named: it follows from the status.
 *
 * @type {'name' | 'description' | 'status' | 'cancelReason' | 'cancelNote' | 'priority' | 'assigneeIds' | 'dueDate' | 'startDate' | 'estimateMinutes' | 'labels' | 'listId' | 'spaceId' | 'parentKey' | 'checklist'}
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
  | 'checklist';

/**
 * Constant TASK_FIELDS
 *
 * @description
 * The fifteen names in the order of the contract, the order of every `changed` list.
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
]);
