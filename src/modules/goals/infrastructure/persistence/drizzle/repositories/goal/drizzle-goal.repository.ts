import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { GoalPosition } from '../../../../../application/models/goal/goal-position.model.js';
import type { GoalRecord } from '../../../../../application/models/goal/goal-record.model.js';
import type { GoalRepository } from '../../../../../application/ports/outbound/persistence/goal/goal-repository.port.js';
import { Goal } from '../../../../../domain/aggregates/goal/goal.aggregate.js';
import { goals } from '../../schemas/goal/goal.schema.js';

/** Reconstitutes the aggregate and the lossless millisecond keyset position. */
function toRecord(row: typeof goals.$inferSelect): GoalRecord {
  return {
    goal: Goal.reconstitute({
      organizationId: row.organizationId,
      id: row.id,
      name: row.name,
      quarter: row.quarter,
      ownerUserId: row.ownerUserId,
      spaceId: row.spaceId,
      dueDate: row.dueDate,
      version: row.version,
      results: row.results,
    }),
    position: { id: row.id, createdAt: row.createdAt },
  };
}

/** Persists goals in the tenant transaction, leaving scope checks to the owning use cases. */
export class DrizzleGoalRepository implements GoalRepository {
  // #region Constructor
  /** Binds all operations to the caller's transaction. */
  public constructor(private readonly db: TransactionDatabase) {}
  // #endregion

  // #region Methods
  /** Allocates an identifier through PostgreSQL before constructing the aggregate. */
  public async nextId(): Promise<string> {
    const result = await this.db.execute<{ id: string }>(sql`select uuidv7() as id`);
    const row = result.rows[0];
    if (row === undefined) throw new Error('The goal identifier query returned no row.');
    return row.id;
  }

  /** Reads only the requested tenant's goal, holding its row on writes. */
  public async find(
    organizationId: string,
    goalId: string,
    lock: boolean,
  ): Promise<GoalRecord | null> {
    const query = this.db
      .select()
      .from(goals)
      .where(and(eq(goals.organizationId, organizationId), eq(goals.id, goalId)))
      .limit(1);
    const [row] = await (lock ? query.for('update') : query);
    return row === undefined ? null : toRecord(row);
  }

  /** Reads a bounded candidate page for a separately authorized visibility projection. */
  public async listCandidates(
    organizationId: string,
    quarter: string,
    after: GoalPosition | null,
    limit: number,
  ): Promise<readonly GoalRecord[]> {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error('The goal page size must be positive.');
    const rows = await this.db
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.organizationId, organizationId),
          eq(goals.quarter, quarter),
          after === null
            ? undefined
            : sql`(${goals.createdAt}, ${goals.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`,
        ),
      )
      .orderBy(desc(goals.createdAt), desc(goals.id))
      .limit(Math.min(limit, 500));
    return rows.map(toRecord);
  }

  /** Inserts the goal and all its key results as a single aggregate row. */
  public async create(goal: Goal): Promise<void> {
    await this.db.insert(goals).values(goal.snapshot);
  }

  /** Persists exactly the next version, preventing a stale aggregate from overwriting another. */
  public async save(goal: Goal): Promise<void> {
    const { organizationId, id, name, ownerUserId, dueDate, version, results } = goal.snapshot;
    const rows = await this.db
      .update(goals)
      .set({ name, ownerUserId, dueDate, version, results, updatedAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(goals.organizationId, organizationId),
          eq(goals.id, id),
          eq(goals.version, version - 1),
        ),
      )
      .returning({ id: goals.id });
    if (rows.length !== 1) throw new Error('The goal changed before its locked update.');
  }

  /** Deletes a goal only inside the specified organization. */
  public async delete(organizationId: string, goalId: string): Promise<void> {
    await this.db
      .delete(goals)
      .where(and(eq(goals.organizationId, organizationId), eq(goals.id, goalId)));
  }
  // #endregion
}
