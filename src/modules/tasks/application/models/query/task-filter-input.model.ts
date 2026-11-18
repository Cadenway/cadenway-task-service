import type { PriorityKey } from '../../../domain/value-objects/task/priority-key.value-object.js';
import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';

/**
 * Interface TaskFilterInput
 *
 * @description
 * The filters of `GET /internal/v1/lists/{listId}/tasks` and of `.../task-groups` as the route
 * carries them, already validated by the presentation layer: the assignees still hold `me`,
 * `none` and account ids, the values may repeat and the labels are as typed. `TaskFilterBuilder`
 * removes the duplicates and lower-cases the accounts. `null` leaves a filter out.
 */
export interface TaskFilterInput {
  // #region Properties
  /** The statuses to keep, 1 to 10. */
  readonly statuses: readonly StatusKey[] | null;

  /** The priorities to keep, 1 to 4. */
  readonly priorities: readonly PriorityKey[] | null;

  /** The assignees to keep, 1 to 20: `me`, `none` or an account id in either case. */
  readonly assignees: readonly string[] | null;

  /** The labels to keep, 1 to 20, as typed. */
  readonly labels: readonly string[] | null;

  /** The text to find, as sent. */
  readonly search: string | null;

  /** Keep the tasks due on or after this date. */
  readonly dueFrom: string | null;

  /** Keep the tasks due on or before this date. */
  readonly dueTo: string | null;

  /** `roots` for the top-level tasks, `all` for the subtasks too. */
  readonly level: 'roots' | 'all';
  // #endregion
}
