import { CancelReasonRequiredError } from '../../errors/task/cancel-reason-required.error.js';
import { CancelReasonUnexpectedError } from '../../errors/task/cancel-reason-unexpected.error.js';
import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { CANCEL_REASONS } from '../../value-objects/task/cancel-reason.value-object.js';
import type { CancelReason } from '../../value-objects/task/cancel-reason.value-object.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import { MAX_CANCEL_NOTE_LENGTH } from '../../value-objects/task/task-limits.value-object.js';
import type { TaskPatch } from '../../value-objects/task/task-patch.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';

/**
 * Function normalizeCancelNote
 *
 * @description
 * `cancelNote` of `TaskCreation` and `TaskPatch` (`openapi/internal/task-service.yaml:2404-2409`
 * and 2550-2555): trimmed, 500 characters at most once trimmed, counted in Unicode code points; an
 * empty note after trimming is none.
 *
 * @param {string | null} note - The note as typed.
 * @returns {string | null} The trimmed note, or `null` when there is none.
 * @throws {InvalidTaskError} When the trimmed note is longer than 500 characters.
 */
export function normalizeCancelNote(note: string | null): string | null {
  if (note === null) {
    return null;
  }
  const trimmed: string = note.trim();
  if (trimmed === '') {
    return null;
  }
  if (Array.from(trimmed).length > MAX_CANCEL_NOTE_LENGTH) {
    throw new InvalidTaskError('the cancel note has at most 500 characters once trimmed');
  }
  return trimmed;
}

/**
 * Function checkReason
 *
 * @description
 * Refuses a reason that is not one of `CancelReason`.
 *
 * @param {CancelReason | null | undefined} reason - The reason, if any.
 * @throws {InvalidTaskError} When it is not one of the four reasons.
 */
function checkReason(reason: CancelReason | null | undefined): void {
  if (reason !== undefined && reason !== null && !CANCEL_REASONS.includes(reason)) {
    throw new InvalidTaskError('the cancel reason is one of the four reasons');
  }
}

/**
 * Function resolveCancellation
 *
 * @description
 * The reason and the note of a task after a creation or a patch (`openapi/public/tasks.yaml:23-25`,
 * 111-114 and 424-429; `TaskPatch.cancelReason`, `openapi/internal/task-service.yaml:2543-2549`):
 *
 * - a task that becomes `cancelled` needs a reason, and takes the note sent, if any;
 * - on a task that stays `cancelled`, the reason and the note change alone; `cancelReason: null`
 *   is refused as a missing reason;
 * - a task that is not `cancelled` after the change has neither: leaving `cancelled` clears both,
 *   and a reason or a note sent for it is refused; `null`, or a note empty once trimmed, is none
 *   and is accepted (open question 4 of the design).
 *
 * @param {Pick<TaskState, 'status' | 'cancelReason' | 'cancelNote'> | null} current - The task
 * before the change, or `null` at a creation.
 * @param {StatusKey} status - The status after the change.
 * @param {Pick<TaskPatch, 'cancelReason' | 'cancelNote'>} change - The reason and the note sent;
 * a member left out is unchanged.
 * @returns {Pick<TaskState, 'cancelReason' | 'cancelNote'>} The reason and the note after the
 * change.
 * @throws {InvalidTaskError} When the reason is unknown or the note too long.
 * @throws {CancelReasonRequiredError} When the task is `cancelled` after the change without a
 * reason.
 * @throws {CancelReasonUnexpectedError} When a reason or a note is sent for a task that is not
 * `cancelled` after the change.
 */
export function resolveCancellation(
  current: Pick<TaskState, 'status' | 'cancelReason' | 'cancelNote'> | null,
  status: StatusKey,
  change: Pick<TaskPatch, 'cancelReason' | 'cancelNote'>,
): Pick<TaskState, 'cancelReason' | 'cancelNote'> {
  checkReason(change.cancelReason);
  const note: string | null | undefined =
    change.cancelNote === undefined ? undefined : normalizeCancelNote(change.cancelNote);
  if (status !== 'cancelled') {
    if ((change.cancelReason ?? null) !== null || (note ?? null) !== null) {
      throw new CancelReasonUnexpectedError();
    }
    return { cancelReason: null, cancelNote: null };
  }
  const staying: Pick<TaskState, 'cancelReason' | 'cancelNote'> | null =
    current?.status === 'cancelled' ? current : null;
  const cancelReason: CancelReason | null =
    change.cancelReason === undefined ? (staying?.cancelReason ?? null) : change.cancelReason;
  if (cancelReason === null) {
    throw new CancelReasonRequiredError();
  }
  return {
    cancelReason,
    cancelNote: note === undefined ? (staying?.cancelNote ?? null) : note,
  };
}
