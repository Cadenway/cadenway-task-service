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
  const subject: string = `activity entry ${row.id}`;
  switch (row.kind) {
    case 'create':
      return { kind: 'create' };
    case 'comment':
      if (row.commentId === null || row.commentExcerpt === null) {
        throw new Error(`The stored comment activity ${row.id} has no comment detail.`);
      }
      return { kind: 'comment', commentId: row.commentId, commentExcerpt: row.commentExcerpt };
    case 'status':
      if (row.statusFrom === null || row.statusTo === null) {
        throw new Error(`The stored status entry ${row.id} of task ${row.taskId} has no status.`);
      }
      return {
        kind: 'status',
        status: {
          from: toStatusKey(row.statusFrom, subject),
          to: toStatusKey(row.statusTo, subject),
        },
      };
    case 'priority':
      if (row.priorityFrom === null || row.priorityTo === null) {
        throw new Error(
          `The stored priority entry ${row.id} of task ${row.taskId} has no priority.`,
        );
      }
      return {
        kind: 'priority',
        priority: {
          from: toPriorityKey(row.priorityFrom, subject),
          to: toPriorityKey(row.priorityTo, subject),
        },
      };
    case 'due':
      return { kind: 'due', dueDate: { from: row.dueFrom, to: row.dueTo } };
    case 'assign':
      if (row.assigneeUserId === null || row.assigneeAdded === null) {
        throw new Error(`The stored assign entry ${row.id} of task ${row.taskId} has no assignee.`);
      }
      return { kind: 'assign', assignee: { userId: row.assigneeUserId, added: row.assigneeAdded } };
    default:
      throw new Error(
        `The stored activity entry ${row.id} of task ${row.taskId} has a kind outside the kinds.`,
      );
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
  if (
    row.actorProvider !== null &&
    row.actorProvider !== 'github' &&
    row.actorProvider !== 'gitlab'
  ) {
    throw new Error(`A stored Git provider is outside the providers (activity entry ${row.id})`);
  }
  return ActivityEntry.restore({
    id: row.id,
    organizationId: row.organizationId,
    taskId: row.taskId,
    listId: row.listId,
    actor: {
      type: toActorType(row.actorType, `activity entry ${row.id}`),
      id: row.actorId,
      ...(row.actorProvider === null ? {} : { provider: row.actorProvider }),
    },
    occurredAt: row.occurredAt,
    change: toActivityChange(row),
    ...(row.initialStatus === null
      ? {}
      : { initialStatus: toStatusKey(row.initialStatus, `activity entry ${row.id}`) }),
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
    | 'commentId'
    | 'commentExcerpt'
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
    commentId: change.kind === 'comment' ? change.commentId : null,
    commentExcerpt: change.kind === 'comment' ? change.commentExcerpt : null,
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
    actorProvider: draft.actor.provider ?? null,
    occurredAt: draft.occurredAt,
    initialStatus: draft.initialStatus ?? null,
    ...toActivityDetail(draft.change),
  };
}
