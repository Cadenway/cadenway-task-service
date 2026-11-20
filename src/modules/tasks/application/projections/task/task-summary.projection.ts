import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';
import type { PriorityKey } from '../../../domain/value-objects/task/priority-key.value-object.js';
import type { CancelReason } from '../../../domain/value-objects/task/cancel-reason.value-object.js';
import type { SubtaskCounts } from './subtask-counts.projection.js';
import type { ChecklistCounts } from './checklist-counts.projection.js';
import type { Recurrence } from '../../../domain/value-objects/task/recurrence.value-object.js';

/**
 * Interface TaskSummaryView
 *
 * @description
 * A task as a row of a list shows it: everything but the description, the note of the
 * cancellation and the items of the checklist (`TaskSummary` of the contract).
 */
export interface TaskSummaryView {
  // #region Properties
  /** Internal id of the task; the contract shows the key only. */
  readonly id: string;

  /** The key, as `CAD-482`. */
  readonly key: string;

  /** Name of the task. */
  readonly name: string;

  /** Status of the task. */
  readonly status: StatusKey;

  /** Why the task was cancelled, `null` unless it is. */
  readonly cancelReason: CancelReason | null;

  /** Priority of the task. */
  readonly priority: PriorityKey;

  /** The accounts assigned, in the order they were assigned. */
  readonly assigneeIds: readonly string[];

  /** Due date, a calendar date. */
  readonly dueDate: string | null;

  /** Start date, a calendar date. */
  readonly startDate: string | null;

  /** Estimate in whole minutes. */
  readonly estimateMinutes: number | null;

  /** Whether the task is a milestone. */
  readonly milestone?: boolean;

  /** Current recurrence cadence. */
  readonly recurrence?: Recurrence;

  /** Sparse active custom field values in the task's current space. */
  readonly customFieldValues?: Readonly<Record<string, string | number>>;

  /** The labels, in the order they were added. */
  readonly labels: readonly string[];

  /** The key of the parent of a subtask, `null` for a top-level task. */
  readonly parentKey: string | null;

  /** The list of the task. */
  readonly listId: string;

  /** The space of that list. */
  readonly spaceId: string;

  /** Direct subtasks and the closed ones. */
  readonly subtaskCounts: SubtaskCounts;

  /** Checklist items and the ticked ones. */
  readonly checklistCounts: ChecklistCounts;

  /** When the task last entered `done`, `null` while it is not. */
  readonly completedAt: Date | null;

  /** When the task was created. */
  readonly createdAt: Date;

  /** Version of the task, also its `ETag`. */
  readonly version: number;
  // #endregion
}
