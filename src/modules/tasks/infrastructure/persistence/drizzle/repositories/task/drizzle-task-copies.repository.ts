import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { TaskCopies } from '../../../../../application/ports/outbound/persistence/task/task-copies.port.js';
import { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { ChecklistItemState } from '../../../../../domain/value-objects/task/checklist-item-state.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { toChecklistItem } from '../../mappers/task/checklist-item.mapper.js';
import type { ChecklistItemRow } from '../../mappers/task/checklist-item.mapper.js';
import { liveTask } from '../../mappers/task/live-task.mapper.js';
import { toTask } from '../../mappers/task/task.mapper.js';
import { checklistItems } from '../../schemas/checklist/checklist-item.schema.js';
import { taskAssignees } from '../../schemas/task/task-assignee.schema.js';
import { taskLabels } from '../../schemas/task/task-label.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';

/** Parent rows supply the keys retained by the source snapshot. */
const parentTasks = alias(tasks, 'copy_source_parent');

/** Five parameters per row: a batch stays well below PostgreSQL's parameter limit. */
const CHECKLIST_BATCH_SIZE = 1000;

/**
 * A source list snapshot and the checklist of a newly copied task, bound to the caller's tenant
 * transaction. Each source read is one bounded SQL statement so task fields and collections share
 * the same READ COMMITTED snapshot.
 */
export class DrizzleTaskCopiesRepository implements TaskCopies {
  // #region Properties
  /** Database of the current tenant transaction. */
  private readonly db: TransactionDatabase;
  // #endregion

  // #region Constructor
  /**
   * Binds the repository to a transaction.
   *
   * @param {TransactionDatabase} db - The tenant transaction's database.
   * @constructor
   */
  public constructor(db: TransactionDatabase) {
    this.db = db;
  }
  // #endregion

  // #region Methods
  /**
   * Reads at most `limit` live tasks in one list, oldest first with id as tie-breaker.
   *
   * @param {string} organizationId - The caller's organization.
   * @param {string} listId - The source list.
   * @param {number} limit - The caller's bound, including its extra row for detecting overflow.
   * @returns {Promise<readonly Task[]>} The coherent source snapshot.
   */
  public async listSources(
    organizationId: string,
    listId: string,
    limit: number,
  ): Promise<readonly Task[]> {
    const rows = await this.db
      .select({
        task: getTableColumns(tasks),
        parentPrefix: parentTasks.keyPrefix,
        parentNumber: parentTasks.keyNumber,
        assigneeIds: sql<readonly string[]>`coalesce((
          select jsonb_agg(a.user_id::text order by a.position, a.user_id)
          from ${taskAssignees} a
          where a.organization_id = ${tasks.organizationId} and a.task_id = ${tasks.id}
        ), '[]'::jsonb)`,
        labels: sql<readonly string[]>`coalesce((
          select jsonb_agg(l.name order by l.position, l.label_key)
          from ${taskLabels} l
          where l.organization_id = ${tasks.organizationId} and l.task_id = ${tasks.id}
        ), '[]'::jsonb)`,
        checklist: sql<readonly ChecklistItemState[]>`coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', c.id::text, 'text', c.text, 'done', c.done, 'position', c.position
          ) order by c.position, c.id)
          from ${checklistItems} c
          where c.organization_id = ${tasks.organizationId} and c.task_id = ${tasks.id}
        ), '[]'::jsonb)`,
      })
      .from(tasks)
      .leftJoin(
        parentTasks,
        and(
          eq(parentTasks.organizationId, tasks.organizationId),
          eq(parentTasks.id, tasks.parentId),
        ),
      )
      .where(and(eq(tasks.organizationId, organizationId), eq(tasks.listId, listId), liveTask()))
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .limit(limit);

    return rows.map((row): Task => {
      const parentKey =
        row.parentPrefix === null || row.parentNumber === null
          ? null
          : TaskKey.of(row.parentPrefix, row.parentNumber);
      if (row.task.parentId !== null && parentKey === null) {
        throw new Error(
          `The parent ${row.task.parentId} of the stored task ${row.task.id} is missing.`,
        );
      }
      return toTask(row.task, parentKey, row.assigneeIds, row.labels, row.checklist);
    });
  }

  /**
   * Copies checklist text and ticks onto a newly inserted task with fresh PostgreSQL identifiers.
   *
   * @param {Task} task - The newly inserted task whose version is kept.
   * @param {readonly ChecklistItemState[]} source - Source items in their stored order.
   * @returns {Promise<Task>} The task with its newly stored checklist.
   */
  public async insertChecklist(task: Task, source: readonly ChecklistItemState[]): Promise<Task> {
    const [copied] = await this.insertChecklists([task], [source]);
    if (copied === undefined) throw new Error('The copied task is missing.');
    return copied;
  }

  /**
   * Inserts initial checklists in bounded batches and restores tasks in their original order.
   *
   * @param {readonly Task[]} tasksToCopy - Newly inserted tasks.
   * @param {readonly (readonly ChecklistItemState[])[]} sources - Corresponding source items.
   * @returns {Promise<readonly Task[]>} Tasks with newly stored checklist identities.
   */
  public async insertChecklists(
    tasksToCopy: readonly Task[],
    sources: readonly (readonly ChecklistItemState[])[],
  ): Promise<readonly Task[]> {
    if (tasksToCopy.length !== sources.length) {
      throw new Error('Each copied task must have a corresponding source checklist.');
    }
    const seen = new Set<string>();
    const values: (typeof checklistItems.$inferInsert)[] = [];
    for (const [index, task] of tasksToCopy.entries()) {
      const state = task.snapshot;
      const key = `${state.organizationId}:${state.id}`;
      if (seen.has(key)) throw new Error('A task cannot be copied more than once in a batch.');
      seen.add(key);
      for (const item of sources[index] ?? []) {
        values.push({
          organizationId: state.organizationId,
          taskId: state.id,
          text: item.text,
          done: item.done,
          position: item.position,
        });
      }
    }

    const byTask = new Map<string, ChecklistItemRow[]>();
    for (let offset = 0; offset < values.length; offset += CHECKLIST_BATCH_SIZE) {
      const rows: ChecklistItemRow[] = await this.db
        .insert(checklistItems)
        .values(values.slice(offset, offset + CHECKLIST_BATCH_SIZE))
        .returning();
      if (rows.length !== Math.min(CHECKLIST_BATCH_SIZE, values.length - offset)) {
        throw new Error('The initial checklists were not fully copied.');
      }
      for (const row of rows) {
        const key = `${row.organizationId}:${row.taskId}`;
        const group = byTask.get(key) ?? [];
        group.push(row);
        byTask.set(key, group);
      }
    }

    return tasksToCopy.map((task: Task): Task => {
      const state = task.snapshot;
      const rows = byTask.get(`${state.organizationId}:${state.id}`);
      if (rows === undefined) return task;
      const checklist = rows
        .map(toChecklistItem)
        .sort(
          (left: ChecklistItemState, right: ChecklistItemState) => left.position - right.position,
        );
      return Task.restore({ ...state, checklist });
    });
  }
  // #endregion
}
