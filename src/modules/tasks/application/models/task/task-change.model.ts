import type { DescriptionMention } from '../../../domain/value-objects/mention/description-mention.value-object.js';
import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';
import type { PriorityKey } from '../../../domain/value-objects/task/priority-key.value-object.js';
import type { CancelReason } from '../../../domain/value-objects/task/cancel-reason.value-object.js';

/**
 * Interface TaskChange
 *
 * @description
 * What a patch of a task says, by presence: a member left out is not touched, `null` clears the
 * members that allow it. `listId` and `parentKey` are the unresolved target of a move or an attach;
 * the use case resolves them to what the domain takes.
 */
export interface TaskChange {
  // #region Properties
  /** New name. */
  readonly name?: string;

  /** New description, `null` clears it. */
  readonly description?: string | null;

  /** Replacement structured description mentions. */
  readonly descriptionMentions?: readonly DescriptionMention[];

  /** New status. */
  readonly status?: StatusKey;

  /** New reason of the cancellation, `null` clears it. */
  readonly cancelReason?: CancelReason | null;

  /** New note of the cancellation, `null` clears it. */
  readonly cancelNote?: string | null;

  /** New priority. */
  readonly priority?: PriorityKey;

  /** New due date, `null` removes it. */
  readonly dueDate?: string | null;

  /** New start date, `null` removes it. */
  readonly startDate?: string | null;

  /** New estimate in minutes, `null` removes it. */
  readonly estimateMinutes?: number | null;

  /** The list to move the task to. */
  readonly listId?: string;

  /** The key of the task to attach it to, `null` detaches it. */
  readonly parentKey?: string | null;
  // #endregion
}
