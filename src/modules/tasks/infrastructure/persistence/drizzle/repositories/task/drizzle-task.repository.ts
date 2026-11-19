import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, getTableColumns, gt, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { TaskStanding } from '../../../../../application/models/task/task-standing.model.js';
import type { TaskRepository } from '../../../../../application/ports/outbound/persistence/task/task-repository.port.js';
import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { SubtreeShape } from '../../../../../domain/value-objects/subtask/subtree-shape.value-object.js';
import type { ChecklistItemDraft } from '../../../../../domain/value-objects/task/checklist-item-draft.value-object.js';
import type { ChecklistItemState } from '../../../../../domain/value-objects/task/checklist-item-state.value-object.js';
import { labelKey } from '../../../../../domain/value-objects/task/label-name.value-object.js';
import type { TaskDraft } from '../../../../../domain/value-objects/task/task-draft.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import { writeArchivesStatement } from '../../mappers/archive/archive-statements.mapper.js';
import { anyOf } from '../../mappers/page/any-of.mapper.js';
import { liveTask } from '../../mappers/task/live-task.mapper.js';
import { subtreeStatement } from '../../mappers/task/subtree-statement.mapper.js';
import { toChecklistItem } from '../../mappers/task/checklist-item.mapper.js';
import type { ChecklistItemRow } from '../../mappers/task/checklist-item.mapper.js';
import { toTask, toTaskInsert, toTaskUpdate } from '../../mappers/task/task.mapper.js';
import type { TaskRow } from '../../mappers/task/task.mapper.js';
import { checklistItems } from '../../schemas/checklist/checklist-item.schema.js';
import { taskAssignees } from '../../schemas/task/task-assignee.schema.js';
import { taskLabels } from '../../schemas/task/task-label.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { DrizzleTaskCollections } from './task-collections.repository.js';

/** A draft of `insertMany` with the row PostgreSQL stored for it. */
interface StoredDraft {
  // #region Properties
  /** The task the domain created. */
  readonly draft: TaskDraft;

  /** The row PostgreSQL stored for it. */
  readonly row: TaskRow;
  // #endregion
}

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
 *   read to see a violation), through the primary key and `tasks_parent_created_index`; the
 *   subtree and the child count of a write are the live ones (`liveTask`).
 * - An archive or a restoration locks its tasks without their checklists (`lockByIds` without
 *   them for the live subtree, `lockArchive`, one ordered statement, for the members of an
 *   archive), the parent of a restored root by one lean statement (`lockStanding`), and writes
 *   them in one `UPDATE ... FROM unnest(...)` (`writeArchives`).
 * - `lockAssignedTo` and `unassignBatch` are set-based: a batch is one locking read (a range scan
 *   of `task_assignees_user_index`, without the checklists), the loads of the assignees, labels and
 *   parents, one delete of the assignee rows and one update of the versions.
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
   * the same tasks in the same order, then loads their collections after the lock (three queries
   * without the checklists, four with them).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids of the tasks.
   * @param {boolean} [withChecklists] - `false` to leave the checklists unloaded; `true` by default.
   * @returns {Promise<readonly Task[]>} The tasks, in ascending id order; unknown ids are left out.
   */
  public async lockByIds(
    organizationId: string,
    ids: readonly string[],
    withChecklists: boolean = true,
  ): Promise<readonly Task[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows: TaskRow[] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organizationId, organizationId), anyOf(tasks.id, ids, 'uuid')))
      .orderBy(asc(tasks.id))
      .for('no key update');
    return this.collections.assemble(organizationId, rows, withChecklists);
  }

  /**
   * Method lockStanding
   *
   * @description
   * Locks one task by primary key `FOR NO KEY UPDATE` and reads only whether it is live
   * (`liveTask`) and its list, in one statement without the collections.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @returns {Promise<TaskStanding | null>} Its standing, or `null` when the organization has no
   * such task.
   */
  public async lockStanding(organizationId: string, taskId: string): Promise<TaskStanding | null> {
    const rows: { live: boolean; listId: string }[] = await this.db
      .select({ live: sql<boolean>`${liveTask()}`, listId: tasks.listId })
      .from(tasks)
      .where(and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId)))
      .limit(1)
      .for('no key update');
    const row: { live: boolean; listId: string } | undefined = rows[0];
    return row === undefined ? null : { live: row.live, listId: row.listId };
  }

  /**
   * Method insert
   *
   * @description
   * Stores one new task: `insertMany` of a single draft.
   *
   * @param {TaskDraft} draft - The task the domain created.
   * @param {TaskKey} key - The key allocated for it.
   * @returns {Promise<Task>} The stored task.
   * @throws {Error} When no row came back.
   */
  public async insert(draft: TaskDraft, key: TaskKey): Promise<Task> {
    const stored: readonly Task[] = await this.insertMany([draft], [key]);
    const task: Task | undefined = stored[0];
    if (task === undefined) {
      throw new Error(`The task ${key.format()} of space ${draft.spaceId} was not stored.`);
    }
    return task;
  }

  /**
   * Method insertMany
   *
   * @description
   * Stores new tasks with one multi-row `INSERT ... RETURNING`, then the assignees of all of them
   * and the labels of all of them in order, one multi-row statement each (three statements
   * whatever the number of tasks). Each task is restored from the row PostgreSQL returned (id,
   * creation instant, version 1) and the draft's collections; a new task has no checklist. The
   * rows are matched to the drafts by key, so the order of `RETURNING` does not matter. Within one
   * statement `uuidv7()` increases, so the tasks of one call, which share their creation instant,
   * keep the order of the drafts under the `(created_at, id)` order of the subtask pages.
   *
   * @param {readonly TaskDraft[]} drafts - The tasks the domain created.
   * @param {readonly TaskKey[]} keys - The key allocated for each draft, in the same order.
   * @returns {Promise<readonly Task[]>} The stored tasks, in the order of the drafts.
   * @throws {Error} When a draft has no key or no row came back for it.
   */
  public async insertMany(
    drafts: readonly TaskDraft[],
    keys: readonly TaskKey[],
  ): Promise<readonly Task[]> {
    if (drafts.length === 0) {
      return [];
    }
    if (keys.length !== drafts.length) {
      throw new Error(
        `${String(drafts.length)} tasks were given ${String(keys.length)} keys, one each is needed.`,
      );
    }
    const rows: TaskRow[] = await this.db
      .insert(tasks)
      .values(
        drafts.map((draft: TaskDraft, index: number) =>
          toTaskInsert(draft, this.keyAt(keys, index)),
        ),
      )
      .returning();
    const byKey = new Map<string, TaskRow>(
      rows.map((row: TaskRow): [string, TaskRow] => [
        TaskKey.of(row.keyPrefix, row.keyNumber).format(),
        row,
      ]),
    );
    const stored: readonly StoredDraft[] = drafts.map((draft: TaskDraft, index: number) => {
      const key: TaskKey = this.keyAt(keys, index);
      const row: TaskRow | undefined = byKey.get(key.format());
      if (row === undefined) {
        throw new Error(`The task ${key.format()} of space ${draft.spaceId} was not stored.`);
      }
      return { draft, row };
    });
    await this.insertAssignees(stored);
    await this.insertLabels(stored);
    return stored.map(({ draft, row }: StoredDraft): Task =>
      toTask(row, draft.parentKey, draft.assigneeIds, draft.labels, []),
    );
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
      const remaining: readonly { id: string }[] = await this.db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.organizationId, next.organizationId), eq(tasks.id, next.id)));
      const label: string = `${next.key.format()} (${next.id})`;
      throw new Error(
        remaining.length === 0
          ? `The task ${label} vanished while it was locked.`
          : `The task ${label} is no longer at version ${String(previous.version)} it was read at.`,
      );
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
      throw new Error(
        `The checklist item at position ${String(draft.position)} of task ${taskId} was not stored.`,
      );
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
      throw new Error(`The task ${taskId} is unknown, it cannot have a level.`);
    }
    return level;
  }

  /**
   * Method subtreeOf
   *
   * @description
   * Walks down from the task through `tasks_parent_created_index` in a recursive CTE
   * (`subtreeStatement`), bounded to three levels of descendants (two are allowed, one more is read
   * to see a violation), through the live subtasks only (`liveTask` at every level): an archived
   * subtask, and what hangs from it, is left out.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @returns {Promise<SubtreeShape>} Its live descendants in the order of their depth then id, and
   * the height (1 for a task without live subtask).
   */
  public async subtreeOf(organizationId: string, taskId: string): Promise<SubtreeShape> {
    const result = await this.db.execute<{ id: string; depth: number }>(
      subtreeStatement(organizationId, taskId),
    );
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
   * Counts the live direct subtasks of a task through `tasks_parent_created_index`, those the
   * limit of 25 counts (`liveTask`).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent.
   * @returns {Promise<number>} The count.
   */
  public async childCount(organizationId: string, parentId: string): Promise<number> {
    const rows: { total: number }[] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(eq(tasks.organizationId, organizationId), eq(tasks.parentId, parentId), liveTask()),
      );
    return rows[0]?.total ?? 0;
  }

  /**
   * Method lockArchive
   *
   * @description
   * Locks the members of an archive in one statement through `tasks_archive_member_index`,
   * `ORDER BY id FOR NO KEY UPDATE`, so two restorations of one archive through two members lock
   * in the same order and the second waits for the first; then loads their assignees, labels and
   * parent keys after the lock, not their checklists (a restoration never writes or emits them,
   * so the members carry an empty one). PostgreSQL checks the condition again on a row it waited
   * for, so a member restored meanwhile is left out.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} rootId - The root of the archive.
   * @returns {Promise<readonly Task[]>} The members without checklist, in ascending id order.
   */
  public async lockArchive(organizationId: string, rootId: string): Promise<readonly Task[]> {
    const rows: TaskRow[] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organizationId, organizationId), eq(tasks.archiveRootId, rootId)))
      .orderBy(asc(tasks.id))
      .for('no key update');
    return this.collections.assemble(organizationId, rows, false);
  }

  /**
   * Method writeArchives
   *
   * @description
   * Writes an archive or a restoration in one `UPDATE ... FROM unnest(...)`
   * (`writeArchivesStatement`), guarded by the version before the change, then checks that every
   * task was written. Neither changes the assignees, the labels or the checklist.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} rootId - The root of the archive made or restored, which a failure names.
   * @param {readonly Task[]} updated - The tasks after `archive` or `unarchive`.
   * @returns {Promise<void>} Resolves once written.
   * @throws {Error} When a task vanished or changed version, which the locks prevent.
   */
  public async writeArchives(
    organizationId: string,
    rootId: string,
    updated: readonly Task[],
  ): Promise<void> {
    if (updated.length === 0) {
      return;
    }
    const states: readonly TaskState[] = updated.map((task: Task): TaskState => task.snapshot);
    const result = await this.db.execute(writeArchivesStatement(organizationId, states));
    if (result.rowCount !== updated.length) {
      throw new Error(
        `${String(updated.length - (result.rowCount ?? 0))} of the ${String(updated.length)} tasks of the archive of ${rootId} vanished or changed version while they were locked.`,
      );
    }
  }

  /**
   * Method lockAssignedTo
   *
   * @description
   * Locks a batch of the tasks an account is assigned to. The keyset and the order are on
   * `task_assignees.task_id`: `WHERE organization_id = $1 AND user_id = $2 AND task_id > $3 ORDER BY
   * task_id LIMIT n` is one range scan of `task_assignees_user_index` that starts where the previous
   * batch ended, so a batch costs the same whatever its position (a keyset on `tasks.id` would let
   * the planner walk the primary key of `tasks` and probe the assignees, which is quadratic over
   * the batches). The tasks are joined by primary key and locked `FOR NO KEY UPDATE OF tasks`;
   * their assignees and labels are read after the lock. Closed tasks are included. The checklists
   * are not loaded: the removal never reads them and its events never carry them, so the tasks
   * returned carry an empty checklist.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {string | null} afterId - The last id of the previous batch, `null` for the first.
   * @param {number} limit - The size of the batch.
   * @returns {Promise<readonly Task[]>} The tasks without checklist; fewer than `limit` on the last
   * batch.
   */
  public async lockAssignedTo(
    organizationId: string,
    userId: string,
    afterId: string | null,
    limit: number,
  ): Promise<readonly Task[]> {
    const after: SQL | undefined = afterId === null ? undefined : gt(taskAssignees.taskId, afterId);
    const rows: TaskRow[] = await this.db
      .select(getTableColumns(tasks))
      .from(taskAssignees)
      .innerJoin(
        tasks,
        and(
          eq(tasks.organizationId, taskAssignees.organizationId),
          eq(tasks.id, taskAssignees.taskId),
        ),
      )
      .where(
        and(
          eq(taskAssignees.organizationId, organizationId),
          eq(taskAssignees.userId, userId),
          eq(tasks.organizationId, organizationId),
          after,
        ),
      )
      .orderBy(asc(taskAssignees.taskId))
      .limit(limit)
      .for('no key update', { of: tasks });
    return this.collections.assemble(organizationId, rows, false);
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
      throw new Error(
        `${String(updated.length - (result.rowCount ?? 0))} of the ${String(updated.length)} tasks of the batch, from ${ids[0] ?? ''}, vanished or changed version while they were locked.`,
      );
    }
  }

  /**
   * Method keyAt
   *
   * @description
   * Reads the key of the draft at an index.
   *
   * @param {readonly TaskKey[]} keys - The keys.
   * @param {number} index - The index of the draft.
   * @returns {TaskKey} The key.
   * @throws {Error} When there is no key at the index.
   */
  private keyAt(keys: readonly TaskKey[], index: number): TaskKey {
    const key: TaskKey | undefined = keys[index];
    if (key === undefined) {
      throw new Error(`The task at position ${String(index)} has no key.`);
    }
    return key;
  }

  /**
   * Method insertAssignees
   *
   * @description
   * Stores the assignees of the new tasks in order, in one multi-row statement.
   *
   * @param {readonly StoredDraft[]} stored - The drafts with their rows.
   * @returns {Promise<void>} Resolves once written; nothing is sent when no task has an assignee.
   */
  private async insertAssignees(stored: readonly StoredDraft[]): Promise<void> {
    const values = stored.flatMap(({ draft, row }: StoredDraft) =>
      draft.assigneeIds.map((userId: string, position: number) => ({
        organizationId: row.organizationId,
        taskId: row.id,
        userId,
        position,
      })),
    );
    if (values.length > 0) {
      await this.db.insert(taskAssignees).values(values);
    }
  }

  /**
   * Method insertLabels
   *
   * @description
   * Stores the labels of the new tasks in order, in one multi-row statement.
   *
   * @param {readonly StoredDraft[]} stored - The drafts with their rows.
   * @returns {Promise<void>} Resolves once written; nothing is sent when no task has a label.
   */
  private async insertLabels(stored: readonly StoredDraft[]): Promise<void> {
    const values = stored.flatMap(({ draft, row }: StoredDraft) =>
      draft.labels.map((name: string, position: number) => ({
        organizationId: row.organizationId,
        taskId: row.id,
        labelKey: labelKey(name),
        name,
        position,
      })),
    );
    if (values.length > 0) {
      await this.db.insert(taskLabels).values(values);
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
