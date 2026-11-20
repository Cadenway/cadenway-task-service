import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, isNull, ne, or, sql } from 'drizzle-orm';

import type { GoalLinkedMilestone } from '../../../../../application/models/goal/goal-linked-milestone.model.js';
import type { GoalListCount } from '../../../../../application/models/goal/goal-list-count.model.js';
import type { GoalTargetReader } from '../../../../../application/ports/outbound/persistence/goal/goal-target-reader.port.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { anyOf } from '../../mappers/page/any-of.mapper.js';
import { liveTask } from '../../mappers/task/live-task.mapper.js';
import { untrashedTask } from '../../mappers/task/untrashed-task.mapper.js';
import { tasks } from '../../schemas/task/task.schema.js';

/** Reads goal target data from the current tenant transaction. */
export class DrizzleGoalTargetRepository implements GoalTargetReader {
  // #region Constructor
  /** Binds the reader to the caller's transaction. */
  public constructor(private readonly db: TransactionDatabase) {}
  // #endregion

  // #region Methods
  /** Reads current milestone placements and holds task rows in ID order when requested. */
  public async milestones(
    organizationId: string,
    keys: readonly string[],
    lock: boolean,
  ): Promise<readonly GoalLinkedMilestone[]> {
    const parsed = [...new Set(keys)]
      .filter((key) => TaskKey.isKey(key))
      .map((key) => TaskKey.parse(key));
    if (parsed.length === 0) return [];

    const results: GoalLinkedMilestone[] = [];
    // A write contains at most one goal's bounded results. Keep its locks in one global order.
    const batchSize = lock ? parsed.length : 500;
    for (let offset = 0; offset < parsed.length; offset += batchSize) {
      const matches = parsed
        .slice(offset, offset + batchSize)
        .map((key) => and(eq(tasks.keyPrefix, key.prefix), eq(tasks.keyNumber, key.number)));
      const query = this.db
        .select({
          keyPrefix: tasks.keyPrefix,
          keyNumber: tasks.keyNumber,
          listId: tasks.listId,
          status: tasks.status,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, organizationId),
            eq(tasks.milestone, true),
            untrashedTask(),
            or(...matches),
          ),
        )
        .orderBy(asc(tasks.id));
      const rows = lock ? await query.for('share') : await query;
      results.push(
        ...rows.map((row) => ({
          key: TaskKey.of(row.keyPrefix, row.keyNumber).format(),
          listId: row.listId,
          status: row.status,
        })),
      );
    }
    return results;
  }

  /** Aggregates only ordinary live roots for the supplied authorized lists. */
  public async listCounts(
    organizationId: string,
    listIds: readonly string[],
  ): Promise<ReadonlyMap<string, GoalListCount>> {
    const ids = [...new Set(listIds)];
    const result = new Map<string, GoalListCount>();
    for (let offset = 0; offset < ids.length; offset += 500) {
      const rows = await this.db
        .select({
          listId: tasks.listId,
          eligibleTaskCount: sql<number>`count(*)::integer`,
          doneTaskCount: sql<number>`count(*) filter (where ${tasks.status} = 'done')::integer`,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, organizationId),
            anyOf(tasks.listId, ids.slice(offset, offset + 500), 'uuid'),
            isNull(tasks.parentId),
            eq(tasks.milestone, false),
            ne(tasks.status, 'cancelled'),
            liveTask(),
          ),
        )
        .groupBy(tasks.listId);
      for (const row of rows) {
        result.set(row.listId, {
          eligibleTaskCount: row.eligibleTaskCount,
          doneTaskCount: row.doneTaskCount,
        });
      }
    }
    return result;
  }
  // #endregion
}
