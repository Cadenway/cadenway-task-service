import { ActivityEntry } from '../../../../../domain/aggregates/activity/activity-entry.aggregate.js';
import type { ActivityChange } from '../../../../../domain/value-objects/activity/activity-change.value-object.js';
import type { ActivityEntryDraft } from '../../../../../domain/value-objects/activity/activity-entry-draft.value-object.js';
import type { ActivityEntryState } from '../../../../../domain/value-objects/activity/activity-entry-state.value-object.js';
import type { activityEntries } from '../../schemas/activity/activity-entry.schema.js';
import { toActorType, toPriorityKey, toStatusKey } from '../task/task-values.mapper.js';

/**
 * Type ActivityEntryRow
 *
 * @description
 * A row of `activity_entries`.
 *
 * @type {typeof activityEntries.$inferSelect}
 */
export type ActivityEntryRow = typeof activityEntries.$inferSelect;

/**
 * Function toActivityChange
 *
 * @description
 * Reads the kind and the detail columns of a row as the change they record. A kind outside the
 * five, or a column its kind needs that is `null`, means the row was written by something else
 * than this service (the `CHECK` constraints of the table tie each column to its kind).
 *
 * @param {ActivityEntryRow} row - The row.
 * @returns {ActivityChange} The change.
 * @throws {Error} When the kind is unknown or the detail of the kind is incomplete.
 */
function toActivityChange(row: ActivityEntryRow): ActivityChange {
  switch (row.kind) {
    case 'create':
      return { kind: 'create' };
    case 'status':
      if (row.statusFrom === null || row.statusTo === null) {
        throw new Error('A stored status entry has no status.');
      }
      return {
        kind: 'status',
        status: { from: toStatusKey(row.statusFrom), to: toStatusKey(row.statusTo) },
      };
    case 'priority':
      if (row.priorityFrom === null || row.priorityTo === null) {
        throw new Error('A stored priority entry has no priority.');
      }
      return {
        kind: 'priority',
        priority: { from: toPriorityKey(row.priorityFrom), to: toPriorityKey(row.priorityTo) },
      };
    case 'due':
      return { kind: 'due', dueDate: { from: row.dueFrom, to: row.dueTo } };
    case 'assign':
      if (row.assigneeUserId === null || row.assigneeAdded === null) {
        throw new Error('A stored assign entry has no assignee.');
      }
      return { kind: 'assign', assignee: { userId: row.assigneeUserId, added: row.assigneeAdded } };
    default:
      throw new Error('A stored activity kind is outside the kinds.');
  }
}

/**
 * Function toActivityEntry
 *
 * @description
 * Maps a row to the entry it stores; the domain restores the entry and refuses one no recording or
 * merge can produce.
 *
 * @param {ActivityEntryRow} row - The row.
 * @returns {ActivityEntryState} The entry.
 * @throws {Error} When the kind, a value or an actor type is outside its set.
 * @throws {InvalidTaskError} When the stored entry breaks an invariant of the domain.
 */
export function toActivityEntry(row: ActivityEntryRow): ActivityEntryState {
  return ActivityEntry.restore({
    id: row.id,
    organizationId: row.organizationId,
    taskId: row.taskId,
    listId: row.listId,
    actor: { type: toActorType(row.actorType), id: row.actorId },
    occurredAt: row.occurredAt,
    change: toActivityChange(row),
  }).snapshot;
}

/**
 * Function toActivityDetail
 *
 * @description
 * The detail columns of a change: those of its kind hold its values, the others are `null`, as the
 * `CHECK` constraints of the table require.
 *
 * @param {ActivityChange} change - The change.
 * @returns {Required<Pick<typeof activityEntries.$inferInsert, 'statusFrom' | 'statusTo' | 'priorityFrom' | 'priorityTo' | 'dueFrom' | 'dueTo' | 'assigneeUserId' | 'assigneeAdded'>>} The columns.
 */
export function toActivityDetail(
  change: ActivityChange,
): Required<
  Pick<
    typeof activityEntries.$inferInsert,
    | 'statusFrom'
    | 'statusTo'
    | 'priorityFrom'
    | 'priorityTo'
    | 'dueFrom'
    | 'dueTo'
    | 'assigneeUserId'
    | 'assigneeAdded'
  >
> {
  return {
    statusFrom: change.kind === 'status' ? change.status.from : null,
    statusTo: change.kind === 'status' ? change.status.to : null,
    priorityFrom: change.kind === 'priority' ? change.priority.from : null,
    priorityTo: change.kind === 'priority' ? change.priority.to : null,
    dueFrom: change.kind === 'due' ? change.dueDate.from : null,
    dueTo: change.kind === 'due' ? change.dueDate.to : null,
    assigneeUserId: change.kind === 'assign' ? change.assignee.userId : null,
    assigneeAdded: change.kind === 'assign' ? change.assignee.added : null,
  };
}

/**
 * Function toActivityEntryInsert
 *
 * @description
 * The columns of a new entry. PostgreSQL gives the id.
 *
 * @param {ActivityEntryDraft} draft - The entry.
 * @returns {typeof activityEntries.$inferInsert} The values to insert.
 */
export function toActivityEntryInsert(
  draft: ActivityEntryDraft,
): typeof activityEntries.$inferInsert {
  return {
    organizationId: draft.organizationId,
    taskId: draft.taskId,
    listId: draft.listId,
    kind: draft.change.kind,
    actorType: draft.actor.type,
    actorId: draft.actor.id,
    occurredAt: draft.occurredAt,
    ...toActivityDetail(draft.change),
  };
}
