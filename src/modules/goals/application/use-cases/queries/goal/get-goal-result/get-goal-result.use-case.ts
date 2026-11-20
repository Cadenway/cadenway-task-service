import type { GoalsUnitOfWork } from '../../../../ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import { requireGoal, requireViewer } from '../../../../services/goal/goal-access.service.js';
import { projectResult } from '../../../../services/goal/goal-result.service.js';
import type { GetGoalResultInput } from './get-goal-result.input.js';
import type { GetGoalResultOutput } from './get-goal-result.output.js';

/** Reads a result only while its current target is visible. */
export class GetGoalResult {
  // #region Constructor
  /** Binds the read snapshot. */
  public constructor(private readonly work: GoalsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Projects the result and its parent's stored version. */
  public execute(input: GetGoalResultInput): Promise<GetGoalResultOutput> {
    return this.work.read(async (store) => {
      const viewer = await requireViewer(store, input, false);
      const goal = await requireGoal(store, viewer, input.goalId, false);
      return {
        result: await projectResult(store, viewer, goal, input.resultId),
        version: goal.snapshot.version,
      };
    });
  }
  // #endregion
}
