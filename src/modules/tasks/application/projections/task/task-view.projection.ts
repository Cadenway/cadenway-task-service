import type { DescriptionMention } from '../../../domain/value-objects/mention/description-mention.value-object.js';
import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';
import type { PriorityKey } from '../../../domain/value-objects/task/priority-key.value-object.js';
import type { CancelReason } from '../../../domain/value-objects/task/cancel-reason.value-object.js';
import type { SubtaskCounts } from './subtask-counts.projection.js';
import type { ChecklistCounts } from './checklist-counts.projection.js';
import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';
import type { ChecklistItemView } from './checklist-item-view.projection.js';

/**
 * Interface TaskView
 *
 * @description
 * A task with its description, its cancel note and its checklist (`Task` of the contract), built
 * in the transaction that read or wrote it. Dates are instants; `dueDate` and `startDate` are
 * calendar dates (`YYYY-MM-DD`).
 */
export interface TaskView {
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

  /** Description, Markdown. */
  readonly description: string | null;

  /** Structured mentions in the stored description. */
  readonly descriptionMentions: readonly DescriptionMention[];

  /** Note of the cancellation, `null` unless cancelled. */
  readonly cancelNote: string | null;

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

  /** The items of the checklist, in the order they were added. */
  readonly checklist: readonly ChecklistItemView[];

  /** Who created the task. */
  readonly createdBy: TaskActor;

  /** When the task last changed, collections included. */
  readonly updatedAt: Date;

  /** When the archive the task belongs to was made, `null` for a live task. */
  readonly archivedAt: Date | null;

  /** Who made that archive, `null` for a live task. */
  readonly archivedBy: TaskActor | null;
  // #endregion
}
