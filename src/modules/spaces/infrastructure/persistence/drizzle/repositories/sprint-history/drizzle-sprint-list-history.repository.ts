import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, desc, eq, gt, inArray, isNotNull, lt, lte, or, sql } from 'drizzle-orm';

import type { PriorSprintReader } from '../../../../../application/ports/outbound/persistence/reporting/prior-sprint-reader.port.js';
import type { PriorSprint } from '../../../../../application/projections/reporting/prior-sprint.projection.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import {
  viewerListGrant,
  viewerListGrantJoin,
  visibleListCondition,
} from '../../mappers/list/visible-list.mapper.js';
import {
  viewerSpaceGrant,
  viewerSpaceGrantJoin,
} from '../../mappers/space/visible-space.mapper.js';
import { taskLists } from '../../schemas/list/task-list.schema.js';
import { spaces } from '../../schemas/space/space.schema.js';
import { sprintListHistory } from '../../schemas/sprint-history/sprint-list-history.schema.js';

const MAX_BATCH = 500;

/** Reads currently authorized sprints and their historical list state in one tenant snapshot. */
export class DrizzleSprintListHistoryRepository implements PriorSprintReader {
  // #region Constructor
  /** Binds every read to the caller's tenant transaction. */
  public constructor(private readonly db: TransactionDatabase) {}
  // #endregion

  // #region Methods
  /** Applies current list visibility before selecting the last four completed sprints. */
  public async listVisibleCompleted(
    organizationId: string,
    spaceId: string,
    viewer: Viewer,
    beforeStartDate: string,
    completedThroughDate: string,
  ): Promise<readonly PriorSprint[]> {
    const rows = await this.db
      .select({
        listId: taskLists.id,
        name: taskLists.name,
        startDate: taskLists.sprintStartDate,
        endDate: taskLists.sprintEndDate,
      })
      .from(taskLists)
      .innerJoin(
        spaces,
        and(eq(spaces.organizationId, organizationId), eq(spaces.id, taskLists.spaceId)),
      )
      .leftJoin(viewerSpaceGrant, viewerSpaceGrantJoin(organizationId, viewer.userId))
      .leftJoin(viewerListGrant, viewerListGrantJoin(organizationId, viewer.userId))
      .where(
        and(
          eq(taskLists.organizationId, organizationId),
          eq(taskLists.spaceId, spaceId),
          isNotNull(taskLists.sprintStartDate),
          isNotNull(taskLists.sprintEndDate),
          lt(taskLists.sprintEndDate, beforeStartDate),
          lte(taskLists.sprintEndDate, completedThroughDate),
          visibleListCondition(viewer),
        ),
      )
      .orderBy(desc(taskLists.sprintEndDate), desc(taskLists.id))
      .limit(4);

    return rows.flatMap((row) =>
      row.startDate === null || row.endDate === null
        ? []
        : [{ ...row, startDate: row.startDate, endDate: row.endDate }],
    );
  }

  /** Returns current readable lists and proof that a row has no captured transition. */
  public async currentLists(
    organizationId: string,
    viewer: Viewer,
    listIds: readonly string[],
  ): Promise<
    readonly {
      readonly listId: string;
      readonly spaceId: string;
      readonly sprintStartDate: string | null;
      readonly sprintEndDate: string | null;
      readonly createdAt: Date;
      readonly unchangedSinceCoverage: boolean;
    }[]
  > {
    this.checkBatch(listIds, MAX_BATCH);
    if (listIds.length === 0) return [];
    return this.db
      .select({
        listId: taskLists.id,
        spaceId: taskLists.spaceId,
        sprintStartDate: taskLists.sprintStartDate,
        sprintEndDate: taskLists.sprintEndDate,
        createdAt: taskLists.createdAt,
        unchangedSinceCoverage: sql<boolean>`not exists (
          select 1 from ${sprintListHistory}
          where ${sprintListHistory.organizationId} = ${organizationId}
            and ${sprintListHistory.listId} = ${taskLists.id}
        )`,
      })
      .from(taskLists)
      .innerJoin(
        spaces,
        and(eq(spaces.organizationId, organizationId), eq(spaces.id, taskLists.spaceId)),
      )
      .leftJoin(viewerSpaceGrant, viewerSpaceGrantJoin(organizationId, viewer.userId))
      .leftJoin(viewerListGrant, viewerListGrantJoin(organizationId, viewer.userId))
      .where(
        and(
          eq(taskLists.organizationId, organizationId),
          inArray(taskLists.id, [...listIds]),
          visibleListCondition(viewer),
        ),
      )
      .orderBy(asc(taskLists.id))
      .limit(MAX_BATCH);
  }

  /** Reads visible list transitions by sequence, pinned to the original observation snapshot. */
  public async listFacts(
    organizationId: string,
    viewer: Viewer,
    listIds: readonly string[],
    until: Date,
    snapshot: string,
    after: bigint | null,
    limit: number,
  ): Promise<readonly (typeof sprintListHistory.$inferSelect)[]> {
    this.checkBatch(listIds, limit);
    if (listIds.length === 0) return [];
    const rows = await this.db
      .select({ fact: sprintListHistory })
      .from(sprintListHistory)
      .innerJoin(
        taskLists,
        and(
          eq(taskLists.organizationId, organizationId),
          eq(taskLists.id, sprintListHistory.listId),
        ),
      )
      .innerJoin(
        spaces,
        and(eq(spaces.organizationId, organizationId), eq(spaces.id, taskLists.spaceId)),
      )
      .leftJoin(viewerSpaceGrant, viewerSpaceGrantJoin(organizationId, viewer.userId))
      .leftJoin(viewerListGrant, viewerListGrantJoin(organizationId, viewer.userId))
      .where(
        and(
          eq(sprintListHistory.organizationId, organizationId),
          inArray(sprintListHistory.listId, [...listIds]),
          visibleListCondition(viewer),
          after === null ? undefined : gt(sprintListHistory.sequence, after),
          or(
            eq(sprintListHistory.baseline, true),
            and(
              lte(sprintListHistory.recordedAt, until),
              sql`pg_visible_in_snapshot(${sprintListHistory.transactionId}, ${snapshot}::pg_snapshot)`,
            ),
          ),
        ),
      )
      .orderBy(asc(sprintListHistory.sequence))
      .limit(limit);
    return rows.map(({ fact }) => fact);
  }

  /** Bounds both the list of requested identifiers and the returned page. */
  private checkBatch(ids: readonly string[], limit: number): void {
    if (ids.length > MAX_BATCH || !Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) {
      throw new Error('Sprint list history batches must contain at most 500 identifiers and rows.');
    }
  }
  // #endregion
}
