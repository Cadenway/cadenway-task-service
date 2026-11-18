import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, getTableColumns, gt, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { TaskRepository } from '../../../../../application/ports/outbound/persistence/task/task-repository.port.js';
import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { SubtreeShape } from '../../../../../domain/value-objects/subtask/subtree-shape.value-object.js';
import type { ChecklistItemDraft } from '../../../../../domain/value-objects/task/checklist-item-draft.value-object.js';
import type { ChecklistItemState } from '../../../../../domain/value-objects/task/checklist-item-state.value-object.js';
import { labelKey } from '../../../../../domain/value-objects/task/label-name.value-object.js';
import type { TaskDraft } from '../../../../../domain/value-objects/task/task-draft.value-object.js';
import type { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import { anyOf } from '../../mappers/page/any-of.mapper.js';
import { toChecklistItem } from '../../mappers/task/checklist-item.mapper.js';
import type { ChecklistItemRow } from '../../mappers/task/checklist-item.mapper.js';
import { toTask, toTaskInsert, toTaskUpdate } from '../../mappers/task/task.mapper.js';
import type { TaskRow } from '../../mappers/task/task.mapper.js';
import { checklistItems } from '../../schemas/checklist/checklist-item.schema.js';
import { taskAssignees } from '../../schemas/task/task-assignee.schema.js';
import { taskLabels } from '../../schemas/task/task-label.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { DrizzleTaskCollections } from './task-collections.repository.js';

/**
 * Class DrizzleTaskRepository
 *
 * @description
 * `TaskRepository` on `tasks`, `task_assignees`, `task_labels` and `checklist_items`, in the
 * transaction of its unit of work. Every query names `organization_id`, the first column of every
 * primary key and index it reads; row-level security is the second barrier.
 *
 * - Reads by key use `tasks_key_unique`; by id, the primary key. The locking reads are
 *   `FOR NO KEY UPDATE` and read the row after the lock (PostgreSQL re-reads the latest committed
 *   version of a row it waited for), then load the collections in separate statements, which see
 *   what was committed up to the lock. A task is always loaded with its collections in a constant
 *   number of queries (`DrizzleTaskCollections`), whatever the number of tasks.
 * - `save` writes the row, then only what differs in the assignees, the labels and the ticks of
 *   the checklist, comparing `before` and `after`: at most one statement per kind of change.
 * - The tree reads are recursive CTEs bounded by the depth limit of 3 levels (one level more is
 *   read to see a violation), through the primary key and `tasks_parent_created_index`.
 * - `lockAssignedTo` and `unassignBatch` are set-based: a batch is one locking read, one delete of
 *   the assignee rows and one update of the versions.
 */
export class DrizzleTaskRepository implements TaskRepository {
  // #region Properties
  /**
   * Property db
   *
   * @description
   * The Drizzle database of the transaction.
   *
   * @type {TransactionDatabase}
   * @readonly
   */
  private readonly db: TransactionDatabase;

  /**
   * Property collections
   *
   * @description
   * The loader of the assignees, labels, checklists and parent keys of task rows.
   *
   * @type {DrizzleTaskCollections}
   * @readonly
   */
  private readonly collections: DrizzleTaskCollections;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the repository to a transaction.
   *
   * @param {TransactionDatabase} db - The Drizzle database of the transaction.
   * @constructor
   */
  public constructor(db: TransactionDatabase) {
    this.db = db;
    this.collections = new DrizzleTaskCollections(db);
  }
  // #endregion

  // #region Methods
  /**
   * Method findByKey
   *
   * @description
   * Finds a task by its key through `tasks_key_unique`, locking the row `FOR NO KEY UPDATE` when
   * asked, and loads its collections after the lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {TaskKey} key - The key.
   * @param {boolean} lock - `true` to lock the row until the end of the transaction.
   * @returns {Promise<Task | null>} The task, or `null` when the organization has none.
   */
  public async findByKey(
    organizationId: string,
    key: TaskKey,
    lock: boolean,
  ): Promise<Task | null> {
    const query = this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          eq(tasks.keyPrefix, key.prefix),
          eq(tasks.keyNumber, key.number),
        ),
      )
      .limit(1);
    const rows: TaskRow[] = lock ? await query.for('no key update') : await query;
    const found: readonly Task[] = await this.collections.assemble(organizationId, rows);
    return found[0] ?? null;
  }

  /**
   * Method lockByIds
   *
   * @description
   * Locks several tasks in one statement, `ORDER BY id FOR NO KEY UPDATE`, so two writers lock
   * the same tasks in the same order, then loads their collections after the lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids of the tasks.
   * @returns {Promise<readonly Task[]>} The tasks, in ascending id order; unknown ids are left out.
   */
  public async lockByIds(organizationId: string, ids: readonly string[]): Promise<readonly Task[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows: TaskRow[] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organizationId, organizationId), anyOf(tasks.id, ids, 'uuid')))
      .orderBy(asc(tasks.id))
      .for('no key update');
    return this.collections.assemble(organizationId, rows);
  }

  /**
   * Method insert
   *
   * @description
   * Stores a new task under its key with one `INSERT ... RETURNING`, then its assignees and its
   * labels in order, one multi-row statement each. The task is restored from the row PostgreSQL
   * returned (id, creation instant, version 1) and the draft's collections; a new task has no
   * checklist.
   *
   * @param {TaskDraft} draft - The task the domain created.
   * @param {TaskKey} key - The key allocated for it.
   * @returns {Promise<Task>} The stored task.
   * @throws {Error} When no row came back.
   */
  public async insert(draft: TaskDraft, key: TaskKey): Promise<Task> {
    const rows: TaskRow[] = await this.db
      .insert(tasks)
      .values(toTaskInsert(draft, key))
      .returning();
    const row: TaskRow | undefined = rows[0];
    if (row === undefined) {
      throw new Error('The task was not stored.');
    }
    if (draft.assigneeIds.length > 0) {
      await this.db.insert(taskAssignees).values(
        draft.assigneeIds.map((userId: string, position: number) => ({
          organizationId: row.organizationId,
          taskId: row.id,
          userId,
          position,
        })),
      );
    }
    if (draft.labels.length > 0) {
      await this.db.insert(taskLabels).values(
        draft.labels.map((name: string, position: number) => ({
          organizationId: row.organizationId,
          taskId: row.id,
          labelKey: labelKey(name),
          name,
          position,
        })),
      );
    }
    return toTask(row, draft.parentKey, draft.assigneeIds, draft.labels, []);
  }

  /**
   * Method save
   *
   * @description
   * Writes a change of a task the caller holds locked. The row is updated with a guard on the
   * version read (`version = before.version`), so a write over a state it did not read fails
   * instead of overwriting. Then, by comparing the two states: the assignees that left are deleted
   * and the ones that came are inserted after the highest position in one statement; the same for
   * the labels, compared by `labelKey`; the items of the checklist whose tick changed are updated
   * in one statement per value. Items that only `after` has were stored by `insertChecklistItem`.
   *
   * @param {Task} before - The task as it was read.
   * @param {Task} after - The task after the change, its version being `before`'s plus one.
   * @returns {Promise<void>} Resolves once written.
   * @throws {Error} When the row is gone or its version is not the one read, which the lock
   * prevents.
   */
  public async save(before: Task, after: Task): Promise<void> {
    const previous: TaskState = before.snapshot;
    const next: TaskState = after.snapshot;
    const updated: { id: string }[] = await this.db
      .update(tasks)
      .set(toTaskUpdate(after))
      .where(
        and(
          eq(tasks.organizationId, next.organizationId),
          eq(tasks.id, next.id),
          eq(tasks.version, previous.version),
        ),
      )
      .returning({ id: tasks.id });
    if (updated.length !== 1) {
      throw new Error('The task vanished or changed while it was locked.');
    }
    await this.saveAssignees(previous, next);
    await this.saveLabels(previous, next);
    await this.saveTicks(previous, next);
  }

  /**
   * Method insertChecklistItem
   *
   * @description
   * Stores a new item with one `INSERT ... RETURNING`; the unique constraint on
   * `(organization_id, task_id, position)` refuses a second item at the same position.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task, locked by the caller.
   * @param {ChecklistItemDraft} draft - The item the domain drafted.
   * @returns {Promise<ChecklistItemState>} The stored item.
   * @throws {Error} When no row came back.
   */
  public async insertChecklistItem(
    organizationId: string,
    taskId: string,
    draft: ChecklistItemDraft,
  ): Promise<ChecklistItemState> {
    const rows: ChecklistItemRow[] = await this.db
      .insert(checklistItems)
      .values({
        organizationId,
        taskId,
        text: draft.text,
        done: draft.done,
        position: draft.position,
      })
      .returning();
    const row: ChecklistItemRow | undefined = rows[0];
    if (row === undefined) {
      throw new Error('The checklist item was not stored.');
    }
    return toChecklistItem(row);
  }

  /**
   * Method levelOf
   *
   * @description
   * Walks up from the task through `parent_id` in a recursive CTE by primary key, bounded to four
   * rows (the three levels allowed and one more to see a violation).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @returns {Promise<number>} 1 for a top-level task, 2 for its subtask, and so on.
   * @throws {Error} When the organization has no such task, a defect: the caller holds it.
   */
  public async levelOf(organizationId: string, taskId: string): Promise<number> {
    const result = await this.db.execute<{ level: number }>(sql`
      with recursive chain (id, parent_id, depth) as (
        select ${tasks.id}, ${tasks.parentId}, 1
        from ${tasks}
        where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.id} = ${taskId}::uuid
        union all
        select parent.id, parent.parent_id, chain.depth + 1
        from chain
        join ${tasks} as parent
          on parent.organization_id = ${organizationId}::uuid and parent.id = chain.parent_id
        where chain.depth < 4
      )
      select count(*)::int as level from chain
    `);
    const level: number | undefined = result.rows[0]?.level;
    if (level === undefined || level < 1) {
      throw new Error('The task is unknown, it cannot have a level.');
    }
    return level;
  }

  /**
   * Method subtreeOf
   *
   * @description
   * Walks down from the task through `tasks_parent_created_index` in a recursive CTE, bounded to
   * three levels of descendants (two are allowed, one more is read to see a violation).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @returns {Promise<SubtreeShape>} Its descendants in the order of their depth then id, and the
   * height (1 for a task without subtask).
   */
  public async subtreeOf(organizationId: string, taskId: string): Promise<SubtreeShape> {
    const result = await this.db.execute<{ id: string; depth: number }>(sql`
      with recursive tree (id, depth) as (
        select ${tasks.id}, 1
        from ${tasks}
        where ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.parentId} = ${taskId}::uuid
        union all
        select child.id, tree.depth + 1
        from tree
        join ${tasks} as child
          on child.organization_id = ${organizationId}::uuid and child.parent_id = tree.id
        where tree.depth < 3
      )
      select id, depth::int as depth from tree order by depth, id
    `);
    const deepest: number = result.rows.reduce(
      (max: number, row: { id: string; depth: number }): number => Math.max(max, row.depth),
      0,
    );
    return {
      taskId,
      descendantIds: result.rows.map((row: { id: string; depth: number }): string => row.id),
      height: deepest + 1,
    };
  }

  /**
   * Method childCount
   *
   * @description
   * Counts the direct subtasks of a task through `tasks_parent_created_index`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent.
   * @returns {Promise<number>} The count.
   */
  public async childCount(organizationId: string, parentId: string): Promise<number> {
    const rows: { total: number }[] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.organizationId, organizationId), eq(tasks.parentId, parentId)));
    return rows[0]?.total ?? 0;
  }

  /**
   * Method lockAssignedTo
   *
   * @description
   * Locks a batch of the tasks an account is assigned to, `ORDER BY tasks.id LIMIT n FOR NO KEY
   * UPDATE OF tasks`, found through `task_assignees_user_index` and after `afterId` in the key
   * order of the primary key. Closed tasks are included. The collections are loaded after the
   * lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {string | null} afterId - The last id of the previous batch, `null` for the first.
   * @param {number} limit - The size of the batch.
   * @returns {Promise<readonly Task[]>} The tasks; fewer than `limit` on the last batch.
   */
  public async lockAssignedTo(
    organizationId: string,
    userId: string,
    afterId: string | null,
    limit: number,
  ): Promise<readonly Task[]> {
    const after: SQL | undefined = afterId === null ? undefined : gt(tasks.id, afterId);
    const rows: TaskRow[] = await this.db
      .select(getTableColumns(tasks))
      .from(tasks)
      .innerJoin(
        taskAssignees,
        and(
          eq(taskAssignees.organizationId, tasks.organizationId),
          eq(taskAssignees.taskId, tasks.id),
        ),
      )
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          eq(taskAssignees.organizationId, organizationId),
          eq(taskAssignees.userId, userId),
          after,
        ),
      )
      .orderBy(asc(tasks.id))
      .limit(limit)
      .for('no key update', { of: tasks });
    return this.collections.assemble(organizationId, rows);
  }

  /**
   * Method unassignBatch
   *
   * @description
   * Deletes the assignee rows of the account for the tasks of the batch in one statement, then
   * writes the versions and instants the domain computed in one `UPDATE ... FROM unnest(...)`,
   * guarded by the version before the change; both statements are scoped to the organization.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {readonly Task[]} updated - The tasks locked by `lockAssignedTo`, after `unassign`.
   * @returns {Promise<void>} Resolves once written.
   * @throws {Error} When a task of the batch vanished or changed version, which the lock prevents.
   */
  public async unassignBatch(
    organizationId: string,
    userId: string,
    updated: readonly Task[],
  ): Promise<void> {
    if (updated.length === 0) {
      return;
    }
    const states: readonly TaskState[] = updated.map((task: Task): TaskState => task.snapshot);
    const ids: string[] = states.map((state: TaskState): string => state.id);
    await this.db
      .delete(taskAssignees)
      .where(
        and(
          eq(taskAssignees.organizationId, organizationId),
          eq(taskAssignees.userId, userId),
          anyOf(taskAssignees.taskId, ids, 'uuid'),
        ),
      );
    const versions: string[] = states.map((state: TaskState): string => String(state.version));
    const instants: string[] = states.map((state: TaskState): string =>
      state.updatedAt.toISOString(),
    );
    const result = await this.db.execute(sql`
      update ${tasks}
      set version = changed.version, updated_at = changed.updated_at
      from unnest(
        ${sql.param(ids)}::uuid[],
        ${sql.param(versions)}::int[],
        ${sql.param(instants)}::timestamptz[]
      ) as changed (id, version, updated_at)
      where ${tasks.organizationId} = ${organizationId}::uuid
        and ${tasks.id} = changed.id
        and ${tasks.version} = changed.version - 1
    `);
    if (result.rowCount !== updated.length) {
      throw new Error('A task of the batch vanished or changed while it was locked.');
    }
  }

  /**
   * Method saveAssignees
   *
   * @description
   * Deletes the assignees that left and inserts the ones that came after the highest position of
   * the task, in the order of `after`, each in one statement.
   *
   * @param {TaskState} before - The state read.
   * @param {TaskState} after - The state after the change.
   * @returns {Promise<void>} Resolves once written.
   */
  private async saveAssignees(before: TaskState, after: TaskState): Promise<void> {
    const removed: string[] = before.assigneeIds.filter(
      (userId: string): boolean => !after.assigneeIds.includes(userId),
    );
    const added: string[] = after.assigneeIds.filter(
      (userId: string): boolean => !before.assigneeIds.includes(userId),
    );
    if (removed.length > 0) {
      await this.db
        .delete(taskAssignees)
        .where(
          and(
            eq(taskAssignees.organizationId, after.organizationId),
            eq(taskAssignees.taskId, after.id),
            anyOf(taskAssignees.userId, removed, 'uuid'),
          ),
        );
    }
    if (added.length > 0) {
      await this.db.execute(sql`
        insert into ${taskAssignees} (organization_id, task_id, user_id, position)
        select ${after.organizationId}::uuid, ${after.id}::uuid, added.user_id,
          base.next_position + added.ordinal - 1
        from unnest(${sql.param(added)}::uuid[]) with ordinality as added (user_id, ordinal)
        cross join (
          select coalesce(max(${taskAssignees.position}), -1) + 1 as next_position
          from ${taskAssignees}
          where ${taskAssignees.organizationId} = ${after.organizationId}::uuid
            and ${taskAssignees.taskId} = ${after.id}::uuid
        ) as base
      `);
    }
  }

  /**
   * Method saveLabels
   *
   * @description
   * Deletes the labels that left and inserts the ones that came after the highest position of the
   * task, in the order of `after`, each in one statement; labels are compared by `labelKey`.
   *
   * @param {TaskState} before - The state read.
   * @param {TaskState} after - The state after the change.
   * @returns {Promise<void>} Resolves once written.
   */
  private async saveLabels(before: TaskState, after: TaskState): Promise<void> {
    const beforeKeys: readonly string[] = before.labels.map(labelKey);
    const afterKeys: readonly string[] = after.labels.map(labelKey);
    const removed: string[] = beforeKeys.filter((key: string): boolean => !afterKeys.includes(key));
    const added: string[] = after.labels.filter(
      (name: string): boolean => !beforeKeys.includes(labelKey(name)),
    );
    if (removed.length > 0) {
      await this.db
        .delete(taskLabels)
        .where(
          and(
            eq(taskLabels.organizationId, after.organizationId),
            eq(taskLabels.taskId, after.id),
            anyOf(taskLabels.labelKey, removed, 'text'),
          ),
        );
    }
    if (added.length > 0) {
      await this.db.execute(sql`
        insert into ${taskLabels} (organization_id, task_id, label_key, name, position)
        select ${after.organizationId}::uuid, ${after.id}::uuid, added.label_key, added.name,
          base.next_position + added.ordinal - 1
        from unnest(${sql.param(added.map(labelKey))}::text[], ${sql.param(added)}::text[])
          with ordinality as added (label_key, name, ordinal)
        cross join (
          select coalesce(max(${taskLabels.position}), -1) + 1 as next_position
          from ${taskLabels}
          where ${taskLabels.organizationId} = ${after.organizationId}::uuid
            and ${taskLabels.taskId} = ${after.id}::uuid
        ) as base
      `);
    }
  }

  /**
   * Method saveTicks
   *
   * @description
   * Updates the items of the checklist whose tick changed, one statement for the items now ticked
   * and one for the items now unticked. The items only `after` has were inserted by
   * `insertChecklistItem`.
   *
   * @param {TaskState} before - The state read.
   * @param {TaskState} after - The state after the change.
   * @returns {Promise<void>} Resolves once written.
   */
  private async saveTicks(before: TaskState, after: TaskState): Promise<void> {
    const previous = new Map<string, boolean>(
      before.checklist.map((item: ChecklistItemState): [string, boolean] => [item.id, item.done]),
    );
    for (const done of [true, false]) {
      const ids: string[] = after.checklist
        .filter((item: ChecklistItemState): boolean => {
          const was: boolean | undefined = previous.get(item.id);
          return was !== undefined && was !== done && item.done === done;
        })
        .map((item: ChecklistItemState): string => item.id);
      if (ids.length > 0) {
        await this.db
          .update(checklistItems)
          .set({ done })
          .where(
            and(
              eq(checklistItems.organizationId, after.organizationId),
              eq(checklistItems.taskId, after.id),
              anyOf(checklistItems.id, ids, 'uuid'),
            ),
          );
      }
    }
  }
  // #endregion
}
