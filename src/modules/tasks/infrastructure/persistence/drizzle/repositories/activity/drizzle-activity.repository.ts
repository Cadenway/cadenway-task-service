import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { ActivityPosition } from '../../../../../application/models/activity/activity-position.model.js';
import type { ListActivityFilter } from '../../../../../application/models/activity/list-activity-filter.model.js';
import type { ActivityRepository } from '../../../../../application/ports/outbound/persistence/activity/activity-repository.port.js';
import type { ActivityEntryDraft } from '../../../../../domain/value-objects/activity/activity-entry-draft.value-object.js';
import type { ActivityEntryState } from '../../../../../domain/value-objects/activity/activity-entry-state.value-object.js';
import type { ActivityKind } from '../../../../../domain/value-objects/activity/activity-kind.value-object.js';
import {
  toActivityDetail,
  toActivityEntry,
  toActivityEntryInsert,
} from '../../mappers/activity/activity-entry.mapper.js';
import type { ActivityEntryRow } from '../../mappers/activity/activity-entry.mapper.js';
import { anyOf } from '../../mappers/page/any-of.mapper.js';
import { keysetBefore } from '../../mappers/page/keyset-before.mapper.js';
import { liveTask } from '../../mappers/task/live-task.mapper.js';
import { activityEntries } from '../../schemas/activity/activity-entry.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';

/**
 * Class DrizzleActivityRepository
 *
 * @description
 * `ActivityRepository` on `activity_entries`, in the transaction of its unit of work. Every query
 * names `organization_id`, the first column of the primary key and of both indexes; row-level
 * security is the second barrier. Pages read `(occurred_at DESC, id DESC)` strictly after the
 * position, at most `limit` rows, through `activity_entries_task_index` (a task) or
 * `activity_entries_list_index` (a list); the count of the same filter is one aggregate query.
 * The activity of a list joins `tasks` on `(organization_id, task_id)` to keep the entries of the
 * tasks that are now in a visible space.
 */
export class DrizzleActivityRepository implements ActivityRepository {
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
  }
  // #endregion

  // #region Methods
  /**
   * Method latestOfKind
   *
   * @description
   * Reads the latest entry of a kind for a task, whoever made it, through
   * `activity_entries_task_index` read backwards.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @param {ActivityKind} kind - The kind.
   * @returns {Promise<ActivityEntryState | null>} The entry, or `null` when the task has none.
   */
  public async latestOfKind(
    organizationId: string,
    taskId: string,
    kind: ActivityKind,
  ): Promise<ActivityEntryState | null> {
    const rows: ActivityEntryRow[] = await this.db
      .select()
      .from(activityEntries)
      .where(
        and(
          eq(activityEntries.organizationId, organizationId),
          eq(activityEntries.taskId, taskId),
          eq(activityEntries.kind, kind),
        ),
      )
      .orderBy(desc(activityEntries.occurredAt), desc(activityEntries.id))
      .limit(1);
    const row: ActivityEntryRow | undefined = rows[0];
    return row === undefined ? null : toActivityEntry(row);
  }

  /**
   * Method insert
   *
   * @description
   * Stores new entries in one multi-row `INSERT`.
   *
   * @param {readonly ActivityEntryDraft[]} drafts - The entries.
   * @returns {Promise<void>} Resolves once stored.
   */
  public async insert(drafts: readonly ActivityEntryDraft[]): Promise<void> {
    if (drafts.length === 0) {
      return;
    }
    await this.db.insert(activityEntries).values(drafts.map(toActivityEntryInsert));
  }

  /**
   * Method update
   *
   * @description
   * Rewrites the instant and the detail of an entry that absorbed a change, by primary key. The
   * kind, the actor, the task and the list of the entry do not change in a merge.
   *
   * @param {ActivityEntryState} entry - The merged entry.
   * @returns {Promise<void>} Resolves once written.
   * @throws {Error} When the entry is gone, which the lock of the task prevents.
   */
  public async update(entry: ActivityEntryState): Promise<void> {
    const updated: { id: string }[] = await this.db
      .update(activityEntries)
      .set({ occurredAt: entry.occurredAt, ...toActivityDetail(entry.change) })
      .where(
        and(
          eq(activityEntries.organizationId, entry.organizationId),
          eq(activityEntries.id, entry.id),
        ),
      )
      .returning({ id: activityEntries.id });
    if (updated.length !== 1) {
      throw new Error(
        `The activity entry ${entry.id} of task ${entry.taskId} vanished while its task was locked.`,
      );
    }
  }

  /**
   * Method remove
   *
   * @description
   * Deletes an entry by primary key.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} entryId - The entry.
   * @returns {Promise<void>} Resolves once deleted.
   */
  public async remove(organizationId: string, entryId: string): Promise<void> {
    await this.db
      .delete(activityEntries)
      .where(
        and(eq(activityEntries.organizationId, organizationId), eq(activityEntries.id, entryId)),
      );
  }

  /**
   * Method pageOfTask
   *
   * @description
   * Reads a page of the entries of a task, most recent first, with the filter on the kinds.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @param {readonly ActivityKind[] | null} kinds - The kinds to keep, `null` for all.
   * @param {ActivityPosition | null} after - The last entry of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ActivityEntryState[]>} The entries.
   */
  public async pageOfTask(
    organizationId: string,
    taskId: string,
    kinds: readonly ActivityKind[] | null,
    after: ActivityPosition | null,
    limit: number,
  ): Promise<readonly ActivityEntryState[]> {
    const rows: ActivityEntryRow[] = await this.db
      .select()
      .from(activityEntries)
      .where(
        and(
          eq(activityEntries.organizationId, organizationId),
          eq(activityEntries.taskId, taskId),
          kinds === null ? undefined : anyOf(activityEntries.kind, kinds, 'text'),
          keysetBefore(activityEntries.occurredAt, activityEntries.id, after),
        ),
      )
      .orderBy(desc(activityEntries.occurredAt), desc(activityEntries.id))
      .limit(limit);
    return rows.map(toActivityEntry);
  }

  /**
   * Method countOfTask
   *
   * @description
   * Counts the entries of a task that match the kinds.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @param {readonly ActivityKind[] | null} kinds - The kinds to keep, `null` for all.
   * @returns {Promise<number>} The count.
   */
  public async countOfTask(
    organizationId: string,
    taskId: string,
    kinds: readonly ActivityKind[] | null,
  ): Promise<number> {
    const rows: { total: number }[] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(activityEntries)
      .where(
        and(
          eq(activityEntries.organizationId, organizationId),
          eq(activityEntries.taskId, taskId),
          kinds === null ? undefined : anyOf(activityEntries.kind, kinds, 'text'),
        ),
      );
    return rows[0]?.total ?? 0;
  }

  /**
   * Method pageOfList
   *
   * @description
   * Reads a page of the entries recorded while their task was in a list, most recent first, kept
   * when the task is now in one of the visible lists; filtered by kinds and actors.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {ListActivityFilter} filter - The list, the visible lists and the filters.
   * @param {ActivityPosition | null} after - The last entry of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ActivityEntryState[]>} The entries.
   */
  public async pageOfList(
    organizationId: string,
    filter: ListActivityFilter,
    after: ActivityPosition | null,
    limit: number,
  ): Promise<readonly ActivityEntryState[]> {
    const rows: ActivityEntryRow[] = await this.db
      .select(getTableColumns(activityEntries))
      .from(activityEntries)
      .innerJoin(
        tasks,
        and(
          eq(tasks.organizationId, activityEntries.organizationId),
          eq(tasks.id, activityEntries.taskId),
        ),
      )
      .where(
        and(
          this.listCondition(organizationId, filter),
          keysetBefore(activityEntries.occurredAt, activityEntries.id, after),
        ),
      )
      .orderBy(desc(activityEntries.occurredAt), desc(activityEntries.id))
      .limit(limit);
    return rows.map(toActivityEntry);
  }

  /**
   * Method countOfList
   *
   * @description
   * Counts the entries `pageOfList` reads, with the same join and filters.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {ListActivityFilter} filter - The list, the visible lists and the filters.
   * @returns {Promise<number>} The count.
   */
  public async countOfList(organizationId: string, filter: ListActivityFilter): Promise<number> {
    const rows: { total: number }[] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(activityEntries)
      .innerJoin(
        tasks,
        and(
          eq(tasks.organizationId, activityEntries.organizationId),
          eq(tasks.id, activityEntries.taskId),
        ),
      )
      .where(this.listCondition(organizationId, filter));
    return rows[0]?.total ?? 0;
  }

  /**
   * Method listCondition
   *
   * @description
   * The conditions both list reads share: the organization on both tables, the list the entry was
   * recorded in, the list of the task as it is now among the visible ones, the task live
   * (`liveTask`: the entries of an archived task leave the activity of a list, items and total), and
   * the optional kinds and actors.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {ListActivityFilter} filter - The list, the visible lists and the filters.
   * @returns {SQL | undefined} The condition.
   */
  private listCondition(organizationId: string, filter: ListActivityFilter): SQL | undefined {
    return and(
      eq(activityEntries.organizationId, organizationId),
      eq(tasks.organizationId, organizationId),
      eq(activityEntries.listId, filter.listId),
      anyOf(tasks.listId, filter.listIds, 'uuid'),
      liveTask(),
      filter.kinds === null ? undefined : anyOf(activityEntries.kind, filter.kinds, 'text'),
      filter.actorIds === null
        ? undefined
        : anyOf(activityEntries.actorId, filter.actorIds, 'text'),
    );
  }
  // #endregion
}
