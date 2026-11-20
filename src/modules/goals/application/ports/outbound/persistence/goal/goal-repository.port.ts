import type { Goal } from '../../../../../domain/aggregates/goal/goal.aggregate.js';
import type { GoalPosition } from '../../../../models/goal/goal-position.model.js';
import type { GoalRecord } from '../../../../models/goal/goal-record.model.js';

/** Tenant-scoped goal persistence in the current transaction. */
export interface GoalRepository {
  // #region Methods
  /** Allocates an identifier using the database UUID v7 generator. */
  nextId(): Promise<string>;

  /** Reads a tenant's aggregate and optionally locks the goal row. */
  find(organizationId: string, goalId: string, lock: boolean): Promise<GoalRecord | null>;

  /** Reads a bounded candidate page. The application applies visibility before returning it. */
  listCandidates(
    organizationId: string,
    quarter: string,
    after: GoalPosition | null,
    limit: number,
  ): Promise<readonly GoalRecord[]>;

  /** Inserts a new aggregate atomically with its results. */
  create(goal: Goal): Promise<void>;

  /** Saves a changed aggregate after its row was locked. */
  save(goal: Goal): Promise<void>;

  /** Deletes the goal and its results after its row was locked. */
  delete(organizationId: string, goalId: string): Promise<void>;
  // #endregion
}
