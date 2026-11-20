import type { DescriptionMention } from '../../../../../domain/value-objects/mention/description-mention.value-object.js';
import type { CancelReason } from '../../../../../domain/value-objects/task/cancel-reason.value-object.js';
import type { PriorityKey } from '../../../../../domain/value-objects/task/priority-key.value-object.js';
import type { StatusKey } from '../../../../../domain/value-objects/task/status-key.value-object.js';

/**
 * Interface CreateTaskInput
 *
 * @description
 * A new task, as the API layer validated it and applied the defaults of the contract (status
 * `todo`, priority `moyenne`, no assignee, no label, no subtask).
 */
export interface CreateTaskInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The list to create the task in. */
  readonly listId: string;

  /** Name of the task. */
  readonly name: string;

  /** Description, Markdown. */
  readonly description: string | null;

  /** Structured mentions supplied with the description. */
  readonly descriptionMentions?: readonly DescriptionMention[];

  /** Status of the task. */
  readonly status: StatusKey;

  /** Why the task is cancelled, with the status `cancelled` only. */
  readonly cancelReason: CancelReason | null;

  /** Note of the cancellation, with the status `cancelled` only. */
  readonly cancelNote: string | null;

  /** Priority of the task. */
  readonly priority: PriorityKey;

  /** The accounts to assign, the same account twice counting once. */
  readonly assigneeIds: readonly string[];

  /** Due date, a calendar date. */
  readonly dueDate: string | null;

  /** Start date, a calendar date; needs a due date. */
  readonly startDate: string | null;

  /** Estimate in whole minutes. */
  readonly estimateMinutes: number | null;

  /** The labels. */
  readonly labels: readonly string[];

  /** The names of the subtasks to create with the task, in order. */
  readonly subtaskNames: readonly string[];
  // #endregion
}
