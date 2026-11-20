import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { ActivityPosition } from '../../../../../application/models/activity/activity-position.model.js';
import type { TaskTimeEntry } from '../../../../../application/models/time/task-time-entry.model.js';
import type { TimeEntryPosition } from '../../../../../application/models/time/time-entry-position.model.js';
import type { TaskTimeRepository } from '../../../../../application/ports/outbound/persistence/time/task-time-repository.port.js';
import type { StatusHistoryEntry } from '../../../../../domain/value-objects/activity/status-history-entry.value-object.js';
import { toActivityEntry } from '../../mappers/activity/activity-entry.mapper.js';
import { activityEntries } from '../../schemas/activity/activity-entry.schema.js';
import { taskTimeEntries } from '../../schemas/time/task-time-entry.schema.js';

/** Transaction-bound persistence for one tenant's task time entries and status history. */
export class DrizzleTaskTimeRepository implements TaskTimeRepository {
  // #region Properties
  /** Database bound to the tenant transaction. */
  private readonly db: TransactionDatabase;
  // #endregion

  // #region Constructor
  /** Binds the repository to the current transaction. */
  public constructor(db: TransactionDatabase) {
    this.db = db;
  }
  // #endregion

  // #region Methods
  /** Inserts an entry and returns the database-assigned identifier and creation instant. */
  public async create(
    organizationId: string,
    taskId: string,
    authorUserId: string,
    minutes: number,
    workDate: string,
    note: string | null,
  ): Promise<TaskTimeEntry> {
    const rows = await this.db
      .insert(taskTimeEntries)
      .values({
        organizationId,
        taskId,
        authorUserId,
        minutes,
        workDate,
        note,
        createdAt: sql`clock_timestamp()`,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('The task time entry insert returned no row.');
    }
    return row;
  }

  /** Reads an entry only when it belongs to the specified tenant and task. */
  public async find(
    organizationId: string,
    taskId: string,
    entryId: string,
  ): Promise<TaskTimeEntry | null> {
    const rows = await this.db
      .select()
      .from(taskTimeEntries)
      .where(
        and(
          eq(taskTimeEntries.organizationId, organizationId),
          eq(taskTimeEntries.taskId, taskId),
          eq(taskTimeEntries.id, entryId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** Deletes only the author's entry on the specified tenant and task. */
  public async remove(
    organizationId: string,
    taskId: string,
    entryId: string,
    authorUserId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .delete(taskTimeEntries)
      .where(
        and(
          eq(taskTimeEntries.organizationId, organizationId),
          eq(taskTimeEntries.taskId, taskId),
          eq(taskTimeEntries.id, entryId),
          eq(taskTimeEntries.authorUserId, authorUserId),
        ),
      )
      .returning({ id: taskTimeEntries.id });
    return rows.length === 1;
  }

  /** Reads a bounded page, newest entries first, with a stable keyset position. */
  public async page(
    organizationId: string,
    taskId: string,
    after: TimeEntryPosition | null,
    limit: number,
  ): Promise<readonly TaskTimeEntry[]> {
    return this.db
      .select()
      .from(taskTimeEntries)
      .where(
        and(
          eq(taskTimeEntries.organizationId, organizationId),
          eq(taskTimeEntries.taskId, taskId),
          after === null
            ? undefined
            : sql`(${taskTimeEntries.createdAt}, ${taskTimeEntries.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`,
        ),
      )
      .orderBy(desc(taskTimeEntries.createdAt), desc(taskTimeEntries.id))
      .limit(Math.min(limit, 500));
  }

  /** Counts entries and sums their minutes before pagination. */
  public async totals(
    organizationId: string,
    taskId: string,
  ): Promise<{ total: number; totalMinutes: number }> {
    const rows = await this.db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        totalMinutes: sql<number>`coalesce(sum(${taskTimeEntries.minutes}), 0)`.mapWith(Number),
      })
      .from(taskTimeEntries)
      .where(
        and(eq(taskTimeEntries.organizationId, organizationId), eq(taskTimeEntries.taskId, taskId)),
      );
    return rows[0] ?? { total: 0, totalMinutes: 0 };
  }

  /** Reads one wall-clock observation at the precision used by activity entries. */
  public async observationTime(): Promise<Date> {
    const result = await this.db.execute<{ instant: string }>(sql`
      select to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as instant
    `);
    const value = result.rows[0]?.instant;
    if (value === undefined) {
      throw new Error('The database gave no observation instant.');
    }
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) {
      throw new Error('The database gave an invalid observation instant.');
    }
    return instant;
  }

  /** Reads one bounded page of a task's creation and status transitions, newest first. */
  public async statusHistoryPage(
    organizationId: string,
    taskId: string,
    after: ActivityPosition | null,
    limit: number,
  ): Promise<readonly StatusHistoryEntry[]> {
    const rows = await this.db
      .select()
      .from(activityEntries)
      .where(
        and(
          eq(activityEntries.organizationId, organizationId),
          eq(activityEntries.taskId, taskId),
          inArray(activityEntries.kind, ['create', 'status']),
          after === null
            ? undefined
            : sql`(${activityEntries.occurredAt}, ${activityEntries.id}) < (${after.occurredAt.toISOString()}::timestamptz, ${after.id}::uuid)`,
        ),
      )
      .orderBy(desc(activityEntries.occurredAt), desc(activityEntries.id))
      .limit(Math.min(limit, 500));
    return rows.map((row): StatusHistoryEntry => {
      const entry = toActivityEntry(row);
      if (entry.change.kind !== 'create' && entry.change.kind !== 'status') {
        throw new Error('The status history query returned an unrelated activity entry.');
      }
      return {
        id: entry.id,
        occurredAt: entry.occurredAt,
        change: entry.change,
        ...(entry.initialStatus === undefined ? {} : { initialStatus: entry.initialStatus }),
      };
    });
  }
  // #endregion
}
