import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import type { SprintHistoryInput } from '../../../../../domain/value-objects/reporting/sprint-history-input.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { toStatusKey } from '../../mappers/task/task-values.mapper.js';
import { spaceCustomFields } from '../../schemas/custom-field/space-custom-field.schema.js';
import { taskCustomFieldValues } from '../../schemas/custom-field/task-custom-field-value.schema.js';
import { sprintFieldHistory } from '../../schemas/sprint-history/sprint-field-history.schema.js';
import { sprintHistoryCoverage } from '../../schemas/sprint-history/sprint-history-coverage.schema.js';
import { sprintTaskHistory } from '../../schemas/sprint-history/sprint-task-history.schema.js';
import { sprintValueHistory } from '../../schemas/sprint-history/sprint-value-history.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';

const MAX_PAGE = 500;

/** Rejects accidental unbounded history scans and oversized SQL arrays. */
function checkBatch(ids: readonly string[], limit: number): void {
  if (ids.length > MAX_PAGE || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) {
    throw new Error('Sprint history batches must contain at most 500 identifiers and rows.');
  }
}

/** Reads raw facts inside a tenant transaction whose authorization has already been established. */
export class DrizzleSprintHistoryRepository {
  // #region Constructor
  /** Binds every read to the caller's tenant transaction. */
  public constructor(private readonly db: TransactionDatabase) {}
  // #endregion

  // #region Methods
  /** Reads the database-wide installation instant for the history collector. */
  public async coverageStartedAt(): Promise<Date | null> {
    const [coverage] = await this.db
      .select({ startedAt: sprintHistoryCoverage.startedAt })
      .from(sprintHistoryCoverage)
      .where(eq(sprintHistoryCoverage.singleton, true))
      .limit(1);
    return coverage?.startedAt ?? null;
  }

  /** Captures the database transaction visibility used to freeze an observation across pages. */
  public async captureObservation(): Promise<string> {
    const result = await this.db.execute<{ snapshot: string }>(
      sql`select pg_current_snapshot()::text as snapshot`,
    );
    const snapshot = result.rows[0]?.snapshot;
    if (snapshot === undefined) throw new Error('PostgreSQL did not provide a snapshot.');
    return snapshot;
  }

  /** Loads live identities and proves whether their current state predates capture unchanged. */
  public async currentTasks(
    organizationId: string,
    taskIds: readonly string[],
    visibleListIds: readonly string[],
  ): Promise<SprintHistoryInput['currentTasks']> {
    checkBatch(taskIds, MAX_PAGE);
    checkBatch(visibleListIds, MAX_PAGE);
    if (taskIds.length === 0 || visibleListIds.length === 0) return [];
    const rows = await this.db
      .select({
        taskId: tasks.id,
        listId: tasks.listId,
        spaceId: tasks.spaceId,
        parentId: tasks.parentId,
        name: tasks.name,
        status: tasks.status,
        estimateMinutes: tasks.estimateMinutes,
        milestone: tasks.milestone,
        archivedAt: tasks.archivedAt,
        trashEntryId: tasks.trashEntryId,
        keyPrefix: tasks.keyPrefix,
        keyNumber: tasks.keyNumber,
        createdAt: tasks.createdAt,
        unchangedSinceCoverage: sql<boolean>`not exists (
          select 1 from ${sprintTaskHistory}
          where ${sprintTaskHistory.organizationId} = ${organizationId}
            and ${sprintTaskHistory.taskId} = ${tasks.id}
        )`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          inArray(tasks.id, [...taskIds]),
          inArray(tasks.listId, [...visibleListIds]),
          isNull(tasks.trashEntryId),
        ),
      )
      .orderBy(asc(tasks.id))
      .limit(MAX_PAGE);
    return rows.map(({ keyPrefix, keyNumber, status, ...row }) => ({
      ...row,
      key: TaskKey.of(keyPrefix, keyNumber),
      status: toStatusKey(status, 'sprint history task'),
    }));
  }

  /** Reads a bounded page of numeric definitions in an already authorized space. */
  public async currentFields(
    organizationId: string,
    spaceId: string,
    afterId: string | null,
    limit: number,
  ): Promise<SprintHistoryInput['currentFields']> {
    checkBatch([], limit);
    return this.db
      .select({
        spaceId: spaceCustomFields.spaceId,
        fieldId: spaceCustomFields.id,
        designated: spaceCustomFields.sprintPoints,
        retiredAt: spaceCustomFields.retiredAt,
        createdAt: spaceCustomFields.createdAt,
        unchangedSinceCoverage: sql<boolean>`not exists (
          select 1 from ${sprintFieldHistory}
          where ${sprintFieldHistory.organizationId} = ${organizationId}
            and ${sprintFieldHistory.fieldId} = ${spaceCustomFields.id}
        )`,
      })
      .from(spaceCustomFields)
      .where(
        and(
          eq(spaceCustomFields.organizationId, organizationId),
          eq(spaceCustomFields.spaceId, spaceId),
          eq(spaceCustomFields.type, 'number'),
          afterId === null ? undefined : gt(spaceCustomFields.id, afterId),
        ),
      )
      .orderBy(asc(spaceCustomFields.id))
      .limit(limit);
  }

  /** Reads numeric values of the authorized tasks using a lossless two-column keyset. */
  public async currentValues(
    organizationId: string,
    taskIds: readonly string[],
    visibleListIds: readonly string[],
    after: { readonly taskId: string; readonly fieldId: string } | null,
    limit: number,
  ): Promise<SprintHistoryInput['currentValues']> {
    checkBatch(taskIds, limit);
    checkBatch(visibleListIds, limit);
    if (taskIds.length === 0 || visibleListIds.length === 0) return [];
    return this.db
      .select({
        taskId: taskCustomFieldValues.taskId,
        fieldId: taskCustomFieldValues.fieldId,
        numberValue: taskCustomFieldValues.numberValue,
        unchangedSinceCoverage: sql<boolean>`not exists (
          select 1 from ${sprintValueHistory}
          where ${sprintValueHistory.organizationId} = ${organizationId}
            and ${sprintValueHistory.taskId} = ${taskCustomFieldValues.taskId}
            and ${sprintValueHistory.fieldId} = ${taskCustomFieldValues.fieldId}
        )`,
      })
      .from(taskCustomFieldValues)
      .innerJoin(
        tasks,
        and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskCustomFieldValues.taskId)),
      )
      .where(
        and(
          eq(taskCustomFieldValues.organizationId, organizationId),
          inArray(taskCustomFieldValues.taskId, [...taskIds]),
          inArray(tasks.listId, [...visibleListIds]),
          isNull(tasks.trashEntryId),
          sql`${taskCustomFieldValues.numberValue} is not null`,
          after === null
            ? undefined
            : or(
                gt(taskCustomFieldValues.taskId, after.taskId),
                and(
                  eq(taskCustomFieldValues.taskId, after.taskId),
                  gt(taskCustomFieldValues.fieldId, after.fieldId),
                ),
              ),
        ),
      )
      .orderBy(asc(taskCustomFieldValues.taskId), asc(taskCustomFieldValues.fieldId))
      .limit(limit);
  }

  /** Lists currently readable tasks which have belonged to a requested sprint. */
  public async candidates(
    organizationId: string,
    sprintListIds: readonly string[],
    visibleListIds: readonly string[],
    afterId: string | null,
    limit: number,
  ): Promise<readonly string[]> {
    checkBatch(sprintListIds, limit);
    checkBatch(visibleListIds, limit);
    if (sprintListIds.length === 0 || visibleListIds.length === 0) return [];

    const rows = await this.db
      .selectDistinct({ id: tasks.id })
      .from(tasks)
      .leftJoin(
        sprintTaskHistory,
        and(
          eq(sprintTaskHistory.organizationId, organizationId),
          eq(sprintTaskHistory.taskId, tasks.id),
          inArray(sprintTaskHistory.listId, [...sprintListIds]),
        ),
      )
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          inArray(tasks.listId, [...visibleListIds]),
          isNull(tasks.trashEntryId),
          or(
            inArray(tasks.listId, [...sprintListIds]),
            sql`${sprintTaskHistory.taskId} is not null`,
          ),
          afterId === null ? undefined : gt(tasks.id, afterId),
        ),
      )
      .orderBy(asc(tasks.id))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  /** Reads task facts in sequence order, preserving the observation's transaction snapshot. */
  public async taskFacts(
    organizationId: string,
    taskIds: readonly string[],
    visibleListIds: readonly string[],
    until: Date,
    snapshot: string,
    after: bigint | null,
    limit: number,
  ): Promise<readonly (typeof sprintTaskHistory.$inferSelect)[]> {
    checkBatch(taskIds, limit);
    checkBatch(visibleListIds, limit);
    if (taskIds.length === 0 || visibleListIds.length === 0) return [];
    return this.db
      .select({ fact: sprintTaskHistory })
      .from(sprintTaskHistory)
      .innerJoin(
        tasks,
        and(eq(tasks.organizationId, organizationId), eq(tasks.id, sprintTaskHistory.taskId)),
      )
      .where(
        and(
          eq(sprintTaskHistory.organizationId, organizationId),
          inArray(sprintTaskHistory.taskId, [...taskIds]),
          inArray(tasks.listId, [...visibleListIds]),
          isNull(tasks.trashEntryId),
          or(
            eq(sprintTaskHistory.baseline, true),
            and(
              lte(sprintTaskHistory.recordedAt, until),
              sql`pg_visible_in_snapshot(${sprintTaskHistory.transactionId}, ${snapshot}::pg_snapshot)`,
            ),
          ),
          after === null ? undefined : gt(sprintTaskHistory.sequence, after),
        ),
      )
      .orderBy(asc(sprintTaskHistory.sequence))
      .limit(limit)
      .then((rows) => rows.map((row) => row.fact));
  }

  /** Reads numeric changes for the same currently visible, unpurged task set. */
  public async valueFacts(
    organizationId: string,
    taskIds: readonly string[],
    visibleListIds: readonly string[],
    until: Date,
    snapshot: string,
    after: bigint | null,
    limit: number,
  ): Promise<readonly (typeof sprintValueHistory.$inferSelect)[]> {
    checkBatch(taskIds, limit);
    checkBatch(visibleListIds, limit);
    if (taskIds.length === 0 || visibleListIds.length === 0) return [];
    return this.db
      .select({ fact: sprintValueHistory })
      .from(sprintValueHistory)
      .innerJoin(
        tasks,
        and(eq(tasks.organizationId, organizationId), eq(tasks.id, sprintValueHistory.taskId)),
      )
      .where(
        and(
          eq(sprintValueHistory.organizationId, organizationId),
          inArray(sprintValueHistory.taskId, [...taskIds]),
          inArray(tasks.listId, [...visibleListIds]),
          isNull(tasks.trashEntryId),
          or(
            eq(sprintValueHistory.baseline, true),
            and(
              lte(sprintValueHistory.recordedAt, until),
              sql`pg_visible_in_snapshot(${sprintValueHistory.transactionId}, ${snapshot}::pg_snapshot)`,
            ),
          ),
          after === null ? undefined : gt(sprintValueHistory.sequence, after),
        ),
      )
      .orderBy(asc(sprintValueHistory.sequence))
      .limit(limit)
      .then((rows) => rows.map((row) => row.fact));
  }

  /** Reads designation changes for an already authorized space. */
  public async fieldFacts(
    organizationId: string,
    spaceId: string,
    until: Date,
    snapshot: string,
    after: bigint | null,
    limit: number,
  ): Promise<readonly (typeof sprintFieldHistory.$inferSelect)[]> {
    checkBatch([], limit);
    return this.db
      .select()
      .from(sprintFieldHistory)
      .where(
        and(
          eq(sprintFieldHistory.organizationId, organizationId),
          eq(sprintFieldHistory.spaceId, spaceId),
          or(
            eq(sprintFieldHistory.baseline, true),
            and(
              lte(sprintFieldHistory.recordedAt, until),
              sql`pg_visible_in_snapshot(${sprintFieldHistory.transactionId}, ${snapshot}::pg_snapshot)`,
            ),
          ),
          after === null ? undefined : gt(sprintFieldHistory.sequence, after),
        ),
      )
      .orderBy(asc(sprintFieldHistory.sequence))
      .limit(limit);
  }
  // #endregion
}
