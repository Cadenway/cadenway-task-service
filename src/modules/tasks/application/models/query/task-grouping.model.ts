/**
 * Type TaskGrouping
 *
 * @description
 * What the tasks of a list are counted by (`groupBy` of `countTaskGroupsInternal`): `status`,
 * `priority` or `assignee`.
 *
 * @type {'status' | 'priority' | 'assignee'}
 */
export type TaskGrouping = 'status' | 'priority' | 'assignee';
