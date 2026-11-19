import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { ChecklistItemState } from '../../../../../domain/value-objects/task/checklist-item-state.value-object.js';
import type { TaskArchive } from '../../../../../domain/value-objects/task/task-archive.value-object.js';
import type { TaskDraft } from '../../../../../domain/value-objects/task/task-draft.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { tasks } from '../../schemas/task/task.schema.js';
import { toActorType, toCancelReason, toPriorityKey, toStatusKey } from './task-values.mapper.js';

/**
 * Type TaskRow
 *
 * @description
 * A row of `tasks`.
 *
 * @type {typeof tasks.$inferSelect}
 */
export type TaskRow = typeof tasks.$inferSelect;

/**
 * Function toTaskArchive
 *
 * @description
 * Reads the archive of a row: `null` for a live task, else its instant, its actor and its root.
 * The four columns are set together (`tasks_archived_check`).
 *
 * @param {TaskRow} row - The row.
 * @param {string} subject - The row the value comes from, such as `task <id>`.
 * @returns {TaskArchive | null} The archive.
 * @throws {Error} When the columns are set apart or the actor type is outside its set.
 */
function toTaskArchive(row: TaskRow, subject: string): TaskArchive | null {
  const { archivedAt, archivedByType, archivedById, archiveRootId } = row;
  if (
    archivedAt === null &&
    archivedByType === null &&
    archivedById === null &&
    archiveRootId === null
  ) {
    return null;
  }
  if (
    archivedAt === null ||
    archivedByType === null ||
    archivedById === null ||
    archiveRootId === null
  ) {
    throw new Error(`A stored archive is set in part only (${subject}).`);
  }
  return {
    at: archivedAt,
    by: { type: toActorType(archivedByType, subject), id: archivedById },
    rootId: archiveRootId,
  };
}

/**
 * Function toTask
 *
 * @description
 * Maps a row, with the collections loaded for it, to the task it stores. The status, the priority,
 * the cancel reason and the type of the creator are narrowed before the domain restores the
 * aggregate, and the domain refuses a state no change can produce (a parent without its key, a
 * cancelled task without reason). The archive columns give the archive of the task, `null` when live.
 *
 * @param {TaskRow} row - The row.
 * @param {TaskKey | null} parentKey - The key of the parent, `null` for a top-level task.
 * @param {readonly string[]} assigneeIds - The assignees in the order of assignment.
 * @param {readonly string[]} labels - The labels in the order of addition.
 * @param {readonly ChecklistItemState[]} checklist - The checklist in the order of addition.
 * @returns {Task} The task.
 * @throws {Error} When a stored status, priority, reason or actor type is outside its set.
 * @throws {InvalidTaskError} When the stored state breaks an invariant of the domain.
 */
export function toTask(
  row: TaskRow,
  parentKey: TaskKey | null,
  assigneeIds: readonly string[],
  labels: readonly string[],
  checklist: readonly ChecklistItemState[],
): Task {
  const subject: string = `task ${row.id}`;
  const state: TaskState = {
    id: row.id,
    organizationId: row.organizationId,
    key: TaskKey.of(row.keyPrefix, row.keyNumber),
    spaceId: row.spaceId,
    listId: row.listId,
    parentId: row.parentId,
    parentKey,
    name: row.name,
    description: row.description,
    status: toStatusKey(row.status, subject),
    cancelReason: toCancelReason(row.cancelReason, subject),
    cancelNote: row.cancelNote,
    priority: toPriorityKey(row.priority, subject),
    assigneeIds,
    labels,
    dueDate: row.dueDate,
    startDate: row.startDate,
    estimateMinutes: row.estimateMinutes,
    completedAt: row.completedAt,
    createdBy: { type: toActorType(row.createdByType, subject), id: row.createdById },
    checklist,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    archive: toTaskArchive(row, subject),
  };
  return Task.restore(state);
}

/**
 * Function toTaskInsert
 *
 * @description
 * The columns of a new task: the members of the draft and the key allocated for it. PostgreSQL
 * gives the id, the creation instant, the update instant and version 1.
 *
 * @param {TaskDraft} draft - The task the domain created.
 * @param {TaskKey} key - The key allocated for it.
 * @returns {typeof tasks.$inferInsert} The values to insert.
 */
export function toTaskInsert(draft: TaskDraft, key: TaskKey): typeof tasks.$inferInsert {
  return {
    organizationId: draft.organizationId,
    keyPrefix: key.prefix,
    keyNumber: key.number,
    spaceId: draft.spaceId,
    listId: draft.listId,
    parentId: draft.parentId,
    name: draft.name,
    description: draft.description,
    status: draft.status,
    cancelReason: draft.cancelReason,
    cancelNote: draft.cancelNote,
    priority: draft.priority,
    dueDate: draft.dueDate,
    startDate: draft.startDate,
    estimateMinutes: draft.estimateMinutes,
    completedAt: draft.completedAt,
    createdByType: draft.createdBy.type,
    createdById: draft.createdBy.id,
  };
}

/**
 * Function toTaskUpdate
 *
 * @description
 * The columns a change can write: every member of the row except the key, the organization, the
 * id, the creation and the archive, which only `writeArchives` writes. `updated_at` and `version`
 * come from the task after the change, so the stored instant is the instant of the transaction
 * the events carry.
 *
 * @param {Task} task - The task after the change.
 * @returns {Partial<typeof tasks.$inferInsert>} The values to set.
 */
export function toTaskUpdate(task: Task): Partial<typeof tasks.$inferInsert> {
  const state: TaskState = task.snapshot;
  return {
    spaceId: state.spaceId,
    listId: state.listId,
    parentId: state.parentId,
    name: state.name,
    description: state.description,
    status: state.status,
    cancelReason: state.cancelReason,
    cancelNote: state.cancelNote,
    priority: state.priority,
    dueDate: state.dueDate,
    startDate: state.startDate,
    estimateMinutes: state.estimateMinutes,
    completedAt: state.completedAt,
    updatedAt: state.updatedAt,
    version: state.version,
  };
}
