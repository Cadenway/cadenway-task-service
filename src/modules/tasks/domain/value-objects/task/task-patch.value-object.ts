import type { TaskAttachment } from '../subtask/task-attachment.value-object.js';
import type { CancelReason } from './cancel-reason.value-object.js';
import type { PriorityKey } from './priority-key.value-object.js';
import type { StatusKey } from './status-key.value-object.js';
import type { TaskPlacement } from './task-placement.value-object.js';

/**
 * Interface TaskPatch
 *
 * @description
 * A change of a task (`TaskPatch` of `openapi/internal/task-service.yaml:2530-2586`), a JSON Merge
 * Patch: a member left out is unchanged, `null` clears what can be empty, and an empty patch
 * changes nothing. `listId` and `parentKey` arrive resolved by the application: `list` is the list
 * the caller sees, `parent` the parent the caller sees with the subtree that would move under it.
 * The assignees, the labels and the checklist change through their own methods.
 */
export interface TaskPatch {
  // #region Properties
  /**
   * Property name
   *
   * @description
   * New name, as typed.
   *
   * @type {string | undefined}
   * @readonly
   */
  readonly name?: string;

  /**
   * Property description
   *
   * @description
   * New description, as sent; `null` removes it.
   *
   * @type {string | null | undefined}
   * @readonly
   */
  readonly description?: string | null;

  /**
   * Property status
   *
   * @description
   * New status, from any other.
   *
   * @type {StatusKey | undefined}
   * @readonly
   */
  readonly status?: StatusKey;

  /**
   * Property cancelReason
   *
   * @description
   * Required when the status becomes `cancelled`; changes the reason of a cancelled task; a reason
   * on a task that is not cancelled after the patch is refused, `null` is accepted as none.
   *
   * @type {CancelReason | null | undefined}
   * @readonly
   */
  readonly cancelReason?: CancelReason | null;

  /**
   * Property cancelNote
   *
   * @description
   * New note of a cancellation, as typed; `null` clears it.
   *
   * @type {string | null | undefined}
   * @readonly
   */
  readonly cancelNote?: string | null;

  /**
   * Property priority
   *
   * @description
   * New priority.
   *
   * @type {PriorityKey | undefined}
   * @readonly
   */
  readonly priority?: PriorityKey;

  /**
   * Property dueDate
   *
   * @description
   * New due date; `null` removes it. Without `startDate`, the start moves with it.
   *
   * @type {string | null | undefined}
   * @readonly
   */
  readonly dueDate?: string | null;

  /**
   * Property startDate
   *
   * @description
   * New first day of the work; `null` removes it.
   *
   * @type {string | null | undefined}
   * @readonly
   */
  readonly startDate?: string | null;

  /**
   * Property estimateMinutes
   *
   * @description
   * New estimate in whole minutes; `null` removes it.
   *
   * @type {number | null | undefined}
   * @readonly
   */
  readonly estimateMinutes?: number | null;

  /**
   * Property list
   *
   * @description
   * The resolved `listId`: the list to move the task to, with its space.
   *
   * @type {TaskPlacement | undefined}
   * @readonly
   */
  readonly list?: TaskPlacement;

  /**
   * Property parent
   *
   * @description
   * The resolved `parentKey`: the parent to attach the task to; `null` detaches it.
   *
   * @type {TaskAttachment | null | undefined}
   * @readonly
   */
  readonly parent?: TaskAttachment | null;
  // #endregion
}
