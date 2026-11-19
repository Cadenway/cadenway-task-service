import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { TrashHandOverInvalidError } from '../../errors/trash/trash-hand-over-invalid.error.js';
import {
  ACTOR_TYPES,
  TASK_SERVICE_ACTOR,
} from '../../value-objects/task/task-actor.value-object.js';
import type { TaskActor } from '../../value-objects/task/task-actor.value-object.js';
import type { TrashHandOver } from '../../value-objects/trash/trash-hand-over.value-object.js';

/**
 * Function handOverOf
 *
 * @description
 * The hand-over of an entry to the purge from its stored parts: `null` while the entry is in the
 * trash, else the instant and the actor of "Vider la corbeille". The parts are set together or not
 * at all.
 *
 * @param {string} entryId - The entry, which an error names.
 * @param {Date | null} at - The stored instant.
 * @param {TaskActor['type'] | null} byType - The stored type of the actor.
 * @param {string | null} byId - The stored id of the actor.
 * @returns {TrashHandOver | null} The hand-over.
 * @throws {TrashHandOverInvalidError} When the parts are set in part only, the instant is invalid,
 * or the actor has an unknown type or an empty id.
 */
export function handOverOf(
  entryId: string,
  at: Date | null,
  byType: TaskActor['type'] | null,
  byId: string | null,
): TrashHandOver | null {
  if (at === null && byType === null && byId === null) {
    return null;
  }
  if (
    at === null ||
    byType === null ||
    byId === null ||
    Number.isNaN(at.getTime()) ||
    !ACTOR_TYPES.includes(byType) ||
    byId === ''
  ) {
    throw new TrashHandOverInvalidError(entryId);
  }
  return { at, by: { type: byType, id: byId } };
}

/**
 * Function isRestorable
 *
 * @description
 * Whether an entry is still in the trash: listed, restored and erased by a person who may restore
 * it ("Who" of `openapi/public/trash.yaml`). An entry "Vider la corbeille" handed to the purge left
 * the trash at once: it no longer lists, restores or erases, and its tasks are not found.
 *
 * @param {TrashHandOver | null} handOver - The hand-over of the entry, `null` while in the trash.
 * @returns {boolean} `true` while the entry is in the trash.
 */
export function isRestorable(handOver: TrashHandOver | null): boolean {
  return handOver === null;
}

/**
 * Function erasureActorOf
 *
 * @description
 * Who erases an entry by the purge job (`task.purged.v1` of `asyncapi/task-service.yaml`): the
 * person who asked "Vider la corbeille" for an entry handed over, task-service for an entry whose
 * 30 days passed.
 *
 * @param {TrashHandOver | null} handOver - The hand-over of the entry, `null` for an entry due.
 * @returns {TaskActor} The actor of the erasure.
 */
export function erasureActorOf(handOver: TrashHandOver | null): TaskActor {
  const by: TaskActor = handOver === null ? TASK_SERVICE_ACTOR : handOver.by;
  return { type: by.type, id: by.id };
}

/**
 * Function subtaskCountOf
 *
 * @description
 * The subtasks of an entry, at every level ("Avec 3 sous-tâches", `subtaskCount` of `TrashEntry`):
 * its tasks less its root.
 *
 * @param {number} taskCount - The tasks of the entry, its root included.
 * @returns {number} The subtasks.
 * @throws {InvalidTaskError} When the count is not a positive integer: an entry holds its root.
 */
export function subtaskCountOf(taskCount: number): number {
  if (!Number.isInteger(taskCount) || taskCount < 1) {
    throw new InvalidTaskError('a trash entry holds its root');
  }
  return taskCount - 1;
}
