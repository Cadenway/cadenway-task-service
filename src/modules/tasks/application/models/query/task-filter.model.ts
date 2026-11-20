import type { PriorityKey } from '../../../domain/value-objects/task/priority-key.value-object.js';
import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';

/**
 * Interface TaskFilter
 *
 * @description
 * What the tasks of a list are filtered with, once the application resolved the route form
 * (`TaskFilterInput`): values of one filter add up (any of them), filters narrow each other
 * (`openapi/public/tasks.yaml:216`). `null` leaves a filter out. Every id is an account id in the
 * form the repository compares, and every label is a `labelKey`.
 */
export interface TaskFilter {
  // #region Properties
  /** The statuses to keep. */
  readonly statuses: readonly StatusKey[] | null;

  /** The priorities to keep. */
  readonly priorities: readonly PriorityKey[] | null;

  /**
   * The assignees to keep: the tasks assigned to one of `userIds`, plus the tasks nobody is
   * assigned when `unassigned` is set (`none`). `me` is already resolved to the actor.
   */
  readonly assignees: {
    readonly userIds: readonly string[];
    readonly unassigned: boolean;
  } | null;

  /** The keys (`labelKey`) of the labels to keep: a task with any of them. */
  readonly labelKeys: readonly string[] | null;

  /** The text to find in the name, the key and the labels, as sent. */
  readonly search: string | null;

  /** Keep the tasks due on or after this date; a task without a due date is left out. */
  readonly dueFrom: string | null;

  /** Keep the tasks due on or before this date; a task without a due date is left out. */
  readonly dueTo: string | null;

  /** Keep only milestones or ordinary tasks when supplied. */
  readonly milestone?: boolean | null;

  /** `true` for the top-level tasks only (`level=roots`), `false` for the subtasks too. */
  readonly rootsOnly: boolean;
  // #endregion
}
