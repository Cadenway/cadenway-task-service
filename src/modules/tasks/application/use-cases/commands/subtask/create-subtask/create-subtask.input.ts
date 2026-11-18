import type { CancelReason } from '../../../../../domain/value-objects/task/cancel-reason.value-object.js';
import type { PriorityKey } from '../../../../../domain/value-objects/task/priority-key.value-object.js';
import type { StatusKey } from '../../../../../domain/value-objects/task/status-key.value-object.js';

/**
 * Interface CreateSubtaskInput
 *
 * @description
 * A new subtask of a task, as the API layer validated it and applied the defaults of the contract
 * (status `todo`, priority `moyenne`, no label). `assigneeIds` is `null` when the request left it
 * out: the subtask then takes the first assignee of its parent.
 */
export interface CreateSubtaskInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the parent. */
  readonly taskKey: string;

  /** Name of the subtask. */
  readonly name: string;

  /** Description, Markdown. */
  readonly description: string | null;

  /** Status of the subtask. */
  readonly status: StatusKey;

  /** Why the subtask is cancelled, with the status `cancelled` only. */
  readonly cancelReason: CancelReason | null;

  /** Note of the cancellation, with the status `cancelled` only. */
  readonly cancelNote: string | null;

  /** Priority of the subtask. */
  readonly priority: PriorityKey;

  /** The accounts to assign, or `null` to take the first assignee of the parent. */
  readonly assigneeIds: readonly string[] | null;

  /** Due date, a calendar date. */
  readonly dueDate: string | null;

  /** Start date, a calendar date; needs a due date. */
  readonly startDate: string | null;

  /** Estimate in whole minutes. */
  readonly estimateMinutes: number | null;

  /** The labels. */
  readonly labels: readonly string[];
  // #endregion
}
