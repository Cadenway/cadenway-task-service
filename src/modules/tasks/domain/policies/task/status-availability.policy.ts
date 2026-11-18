import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { StatusHiddenError } from '../../errors/task/status-hidden.error.js';
import type { SpaceStatusUse } from '../../value-objects/task/space-status-use.value-object.js';
import { STATUS_KEYS } from '../../value-objects/task/status-key.value-object.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';

/**
 * Function checkStatusAvailable
 *
 * @description
 * Refuses a new status that the space the task is in after the change no longer uses
 * ("Statuses" of `openapi/public/tasks.yaml:20-23`; 111-112 for a creation; 424-425 and 445-447
 * for a patch). A status the task already has is never refused, so a task keeps a status its
 * space stopped using, and a move or an attachment keeps the status even when the new space hides
 * it; a new status given with a move is checked against the new space.
 *
 * @param {StatusKey} status - The status after the change.
 * @param {StatusKey | null} currentStatus - The status before the change, or `null` at a creation.
 * @param {SpaceStatusUse} statuses - The statuses of the space the task is in after the change.
 * @throws {InvalidTaskError} When `status` is not one of the ten keys.
 * @throws {StatusHiddenError} When `status` is new and hidden in that space.
 */
export function checkStatusAvailable(
  status: StatusKey,
  currentStatus: StatusKey | null,
  statuses: SpaceStatusUse,
): void {
  if (!STATUS_KEYS.includes(status)) {
    throw new InvalidTaskError('the status is one of the ten status keys');
  }
  if (status === currentStatus) {
    return;
  }
  if (statuses[status].hidden) {
    throw new StatusHiddenError(status);
  }
}
