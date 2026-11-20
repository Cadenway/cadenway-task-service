import type { TenantTransactionRunner } from '@cadenway/nest-common/database';

import type { GoalTargetReader } from '../../../../../application/ports/outbound/persistence/goal/goal-target-reader.port.js';
import type { GoalTargetUnitOfWork } from '../../../../../application/ports/outbound/transactions/goal/goal-target-unit-of-work.port.js';
import { DrizzleGoalTargetRepository } from '../../repositories/goal/drizzle-goal-target.repository.js';

/** Joins the caller's tenant transaction for goal target access and measurement. */
export class TenantGoalTargetUnitOfWork implements GoalTargetUnitOfWork {
  // #region Constructor
  /** Binds reads to the shared tenant transaction runner. */
  public constructor(private readonly runner: TenantTransactionRunner) {}
  // #endregion

  // #region Methods
  /** Joins or opens the write transaction so target locks survive until commit. */
  public run<T>(work: (reader: GoalTargetReader) => Promise<T>): Promise<T> {
    return this.runner.run(({ db }) => work(new DrizzleGoalTargetRepository(db)));
  }

  /** Joins the goal snapshot, or reads inside the enclosing goal mutation for its response. */
  public read<T>(work: (reader: GoalTargetReader) => Promise<T>): Promise<T> {
    return this.run(work);
  }
  // #endregion
}
