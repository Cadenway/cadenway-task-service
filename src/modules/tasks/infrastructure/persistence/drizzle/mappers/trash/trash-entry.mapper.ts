import type { TrashEntryRecord } from '../../../../../application/models/trash/trash-entry-record.model.js';
import { handOverOf } from '../../../../../domain/policies/trash/trash-entry.policy.js';
import { toTaskKeyText } from '../task/task-summary.mapper.js';
import { toActorType, toStatusKey } from '../task/task-values.mapper.js';
import type { RawTrashEntryRow } from './raw-trash-entry-row.mapper.js';

/**
 * Function toTrashEntryRecord
 *
 * @description
 * Maps a row of an entry and its root to the stored entry: the instants parsed from their UTC
 * texts, the actor types and the status of the root narrowed, the key of the root checked, and
 * the hand-over to the purge read by the domain (`handOverOf`), its parts set together or not at
 * all.
 *
 * @param {RawTrashEntryRow} raw - The row.
 * @returns {TrashEntryRecord} The entry.
 * @throws {Error} When a stored actor type or status is outside its set.
 * @throws {TrashHandOverInvalidError} When the hand-over is set in part only.
 * @throws {InvalidTaskError} When the stored key of the root is not a key.
 */
export function toTrashEntryRecord(raw: RawTrashEntryRow): TrashEntryRecord {
  const subject: string = `trash entry ${raw.id}`;
  return {
    id: raw.id,
    organizationId: raw.organizationId,
    rootTaskId: raw.rootTaskId,
    listId: raw.listId,
    parentKey: raw.parentKey,
    taskCount: raw.taskCount,
    rootErased: raw.rootErased,
    trashedAt: new Date(raw.trashedAt),
    trashedBy: { type: toActorType(raw.trashedByType, subject), id: raw.trashedById },
    root: {
      key: toTaskKeyText(raw.rootKeyPrefix, raw.rootKeyNumber),
      name: raw.rootName,
      status: toStatusKey(raw.rootStatus, subject),
    },
    purgeRequest: handOverOf(
      raw.id,
      raw.purgeRequestedAt === null ? null : new Date(raw.purgeRequestedAt),
      raw.purgeRequestedByType === null ? null : toActorType(raw.purgeRequestedByType, subject),
      raw.purgeRequestedById,
    ),
  };
}
