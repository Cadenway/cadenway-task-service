import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';

import type { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';
import type { SubtaskCounts } from '../../../../../application/projections/task/subtask-counts.projection.js';
import type { TaskLocation } from '../../../../../application/projections/task/task-location.projection.js';
import type { TaskReferenceInListView } from '../../../../../application/projections/task/task-reference-in-list.projection.js';
import type { TaskSummaryView } from '../../../../../application/projections/task/task-summary.projection.js';
import type { TaskReader } from '../../../../../application/ports/outbound/persistence/task/task-reader.port.js';
import { keysetAfter } from '../../mappers/page/keyset-after.mapper.js';
import { anyOf } from '../../mappers/page/any-of.mapper.js';
import {
  parentOfTask,
  parentTasks,
  sameArchiveAsParent,
} from '../../mappers/task/same-archive.mapper.js';
import { toTaskLocation, toTaskReference } from '../../mappers/task/task-summary.mapper.js';
import { untrashedTask } from '../../mappers/task/untrashed-task.mapper.js';
import type { TaskRow } from '../../mappers/task/task.mapper.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { DrizzleTaskCollections } from './task-collections.repository.js';

/** The columns of `tasks` a location reads. */
type TaskLocationRow = Pick<
  TaskRow,
  'id' | 'keyPrefix' | 'keyNumber' | 'name' | 'status' | 'listId' | 'spaceId'
>;

/**
 * Constant LOCATION_COLUMNS
 *
 * @description
 * The selection of a location: the id, the key, the name, the status, the list and the space.
 *
 * @type {{ readonly id: typeof tasks.id; readonly keyPrefix: typeof tasks.keyPrefix; ... }}
 */
const LOCATION_COLUMNS: {
  readonly id: typeof tasks.id;
  readonly keyPrefix: typeof tasks.keyPrefix;
  readonly keyNumber: typeof tasks.keyNumber;
  readonly name: typeof tasks.name;
  readonly status: typeof tasks.status;
  readonly listId: typeof tasks.listId;
  readonly spaceId: typeof tasks.spaceId;
} = {
  id: tasks.id,
  keyPrefix: tasks.keyPrefix,
  keyNumber: tasks.keyNumber,
  name: tasks.name,
  status: tasks.status,
  listId: tasks.listId,
  spaceId: tasks.spaceId,
};

/**
 * Class DrizzleTaskReader
 *
 * @description
 * `TaskReader` on `tasks`, `task_assignees`, `task_labels` and `checklist_items`, in the
 * transaction of its unit of work, without a lock. Every query names `organization_id`. The counts,
 * the references and the locations are one grouped or `= ANY($ids)` query for any number of tasks; a page of
 * subtasks costs seven queries however many rows it holds: the page (served by
 * `tasks_parent_created_index`, bounded by the `limit` of the caller), then the assignees, the
 * labels, the subtask counts, the checklist counts, parent keys and custom field values of its rows.
 */
export class DrizzleTaskReader implements TaskReader {
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
   * The loader of the assignees, labels and keys of task rows.
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
   * Binds the reader to a transaction.
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
  /** Reads fields only for the placements associated with the authorized task rows. */
  public async customFieldValues(
    organizationId: string,
    tasks: readonly {
      readonly taskId: string;
      readonly spaceId: string;
      readonly listId: string;
    }[],
  ): Promise<ReadonlyMap<string, Readonly<Record<string, string | number>>>> {
    return this.collections.customFieldValuesOf(organizationId, tasks);
  }

  /**
   * Method subtaskCounts
   *
   * @description
   * Counts the direct subtasks of tasks, and the closed ones, in one grouped query through
   * `tasks_parent_created_index`, loaded by the helper shared with the readers of the queries.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, SubtaskCounts>>} The counts by task id; a task without
   * subtask is left out.
   */
  public async subtaskCounts(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, SubtaskCounts>> {
    return this.collections.subtaskCountsOf(organizationId, taskIds);
  }

  /**
   * Method childrenOf
   *
   * @description
   * Reads a page of the direct subtasks of a task of its archive (`sameArchiveAsParent`, the
   * parent joined by its primary key) in the order `(created_at, id)`, after `after`, summarized by `DrizzleTaskCollections.summarize` (as the pages of the queries are):
   * the assignees, labels, subtask counts and checklist counts, each loaded for the whole page in
   * one query, and the key of the parent. A parent that holds no subtask, or is unknown, gives no
   * row.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent.
   * @param {PagePosition | null} after - The last row of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly TaskSummaryView[]>} The rows.
   * @throws {Error} When a stored value is outside its set.
   */
  public async childrenOf(
    organizationId: string,
    parentId: string,
    after: PagePosition | null,
    limit: number,
  ): Promise<readonly TaskSummaryView[]> {
    const rows: TaskRow[] = await this.db
      .select(getTableColumns(tasks))
      .from(tasks)
      .innerJoin(parentTasks, parentOfTask())
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          eq(tasks.parentId, parentId),
          sameArchiveAsParent(),
          keysetAfter(tasks.createdAt, tasks.id, after),
        ),
      )
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .limit(limit);
    return this.collections.summarize(organizationId, rows);
  }

  /**
   * Method countChildren
   *
   * @description
   * Counts the direct subtasks of a task of its archive (`sameArchiveAsParent`) through
   * `tasks_parent_created_index`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} parentId - The parent.
   * @returns {Promise<number>} The count.
   */
  public async countChildren(organizationId: string, parentId: string): Promise<number> {
    const rows: { total: number }[] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(parentTasks, parentOfTask())
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          eq(tasks.parentId, parentId),
          sameArchiveAsParent(),
        ),
      );
    return rows[0]?.total ?? 0;
  }

  /**
   * Method references
   *
   * @description
   * Reads the key, the name, the status, the list and the trash of tasks in one query by primary
   * key.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The tasks.
   * @returns {Promise<ReadonlyMap<string, TaskReferenceInListView>>} The references by task id.
   * @throws {Error} When a stored status is outside the status keys.
   */
  public async references(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<ReadonlyMap<string, TaskReferenceInListView>> {
    const references = new Map<string, TaskReferenceInListView>();
    if (taskIds.length === 0) {
      return references;
    }
    const rows: Pick<
      TaskRow,
      'id' | 'keyPrefix' | 'keyNumber' | 'name' | 'status' | 'listId' | 'trashEntryId'
    >[] = await this.db
      .select({
        id: tasks.id,
        keyPrefix: tasks.keyPrefix,
        keyNumber: tasks.keyNumber,
        name: tasks.name,
        status: tasks.status,
        listId: tasks.listId,
        trashEntryId: tasks.trashEntryId,
      })
      .from(tasks)
      .where(and(eq(tasks.organizationId, organizationId), anyOf(tasks.id, taskIds, 'uuid')));
    for (const row of rows) {
      references.set(row.id, {
        ...toTaskReference(row),
        listId: row.listId,
        inTrash: row.trashEntryId !== null,
      });
    }
    return references;
  }

  /**
   * Method locationByKey
   *
   * @description
   * Reads where a task is by its key, in one statement through `tasks_key_unique`, without its
   * collections and without a lock; a task in the trash is left out (`trash_entry_id is null`).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {TaskKey} key - The key.
   * @returns {Promise<TaskLocation | null>} The task, or `null` when the organization has none or
   * it is in the trash.
   * @throws {Error} When the stored status is outside the status keys.
   */
  public async locationByKey(organizationId: string, key: TaskKey): Promise<TaskLocation | null> {
    const rows: TaskLocationRow[] = await this.db
      .select(LOCATION_COLUMNS)
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          eq(tasks.keyPrefix, key.prefix),
          eq(tasks.keyNumber, key.number),
          untrashedTask(),
        ),
      )
      .limit(1);
    const row: TaskLocationRow | undefined = rows[0];
    return row === undefined ? null : toTaskLocation(row);
  }

  /** Reads a task's location and archive state in one tenant-scoped statement. */
  public async attachmentLocationByKey(
    organizationId: string,
    key: TaskKey,
  ): Promise<(TaskLocation & { readonly archived: boolean }) | null> {
    const rows = await this.db
      .select({ ...LOCATION_COLUMNS, archivedAt: tasks.archivedAt })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          eq(tasks.keyPrefix, key.prefix),
          eq(tasks.keyNumber, key.number),
          untrashedTask(),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : { ...toTaskLocation(row), archived: row.archivedAt !== null };
  }

  /**
   * Method locationsByIds
   *
   * @description
   * Reads where tasks are by their ids, in one statement by primary key (`= ANY($ids)`), without
   * their collections and without a lock; the tasks in the trash are left out. No id reads
   * nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} taskIds - The ids of the tasks, UUIDs.
   * @returns {Promise<readonly TaskLocation[]>} The tasks found, in no particular order.
   * @throws {Error} When a stored status is outside the status keys.
   */
  public async locationsByIds(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<readonly TaskLocation[]> {
    if (taskIds.length === 0) {
      return [];
    }
    const rows: TaskLocationRow[] = await this.db
      .select(LOCATION_COLUMNS)
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          anyOf(tasks.id, taskIds, 'uuid'),
          untrashedTask(),
        ),
      );
    return rows.map((row: TaskLocationRow): TaskLocation => toTaskLocation(row));
  }
  // #endregion
}
