import { CANCEL_REASONS } from '../../../../../domain/value-objects/task/cancel-reason.value-object.js';
import type { CancelReason } from '../../../../../domain/value-objects/task/cancel-reason.value-object.js';
import { PRIORITY_KEYS } from '../../../../../domain/value-objects/task/priority-key.value-object.js';
import type { PriorityKey } from '../../../../../domain/value-objects/task/priority-key.value-object.js';
import { STATUS_KEYS } from '../../../../../domain/value-objects/task/status-key.value-object.js';
import type { StatusKey } from '../../../../../domain/value-objects/task/status-key.value-object.js';
import { ACTOR_TYPES } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';

/**
 * Function toStatusKey
 *
 * @description
 * Narrows a stored status to the ten status keys. The column is plain `text` with a `CHECK`, so a
 * value outside the set means the row was written by something else than this service.
 *
 * @param {string} value - The stored status.
 * @returns {StatusKey} The status.
 * @throws {Error} When the value is not a status key.
 */
export function toStatusKey(value: string): StatusKey {
  const status: StatusKey | undefined = STATUS_KEYS.find(
    (candidate: StatusKey): boolean => candidate === value,
  );
  if (status === undefined) {
    throw new Error('A stored status is outside the status keys.');
  }
  return status;
}

/**
 * Function toPriorityKey
 *
 * @description
 * Narrows a stored priority to the four priorities.
 *
 * @param {string} value - The stored priority.
 * @returns {PriorityKey} The priority.
 * @throws {Error} When the value is not a priority.
 */
export function toPriorityKey(value: string): PriorityKey {
  const priority: PriorityKey | undefined = PRIORITY_KEYS.find(
    (candidate: PriorityKey): boolean => candidate === value,
  );
  if (priority === undefined) {
    throw new Error('A stored priority is outside the priorities.');
  }
  return priority;
}

/**
 * Function toCancelReason
 *
 * @description
 * Narrows a stored cancel reason to the four reasons; `null` stays `null` (no reason).
 *
 * @param {string | null} value - The stored reason.
 * @returns {CancelReason | null} The reason, or `null`.
 * @throws {Error} When the value is not a cancel reason.
 */
export function toCancelReason(value: string | null): CancelReason | null {
  if (value === null) {
    return null;
  }
  const reason: CancelReason | undefined = CANCEL_REASONS.find(
    (candidate: CancelReason): boolean => candidate === value,
  );
  if (reason === undefined) {
    throw new Error('A stored cancel reason is outside the cancel reasons.');
  }
  return reason;
}

/**
 * Function toActorType
 *
 * @description
 * Narrows a stored actor type to the four types of an actor.
 *
 * @param {string} value - The stored type.
 * @returns {TaskActor['type']} The type.
 * @throws {Error} When the value is not an actor type.
 */
export function toActorType(value: string): TaskActor['type'] {
  const type: TaskActor['type'] | undefined = ACTOR_TYPES.find(
    (candidate: TaskActor['type']): boolean => candidate === value,
  );
  if (type === undefined) {
    throw new Error('A stored actor type is outside the actor types.');
  }
  return type;
}
