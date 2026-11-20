import { rethrowGoalFailure } from '../../../../services/goal/goal-failure.service.js';
import type { GoalsUnitOfWork } from '../../../../ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import {
  requireGoal,
  requireVersion,
  requireViewer,
} from '../../../../services/goal/goal-access.service.js';
import { projectResult, requireResult } from '../../../../services/goal/goal-result.service.js';
import type { UpdateGoalResultInput } from './update-goal-result.input.js';
import type { UpdateGoalResultOutput } from './update-goal-result.output.js';

/** Applies a kind-specific patch to one readable result. */
export class UpdateGoalResult {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: GoalsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Holds the current target through the write and skips persistence for no change. */
  public execute(input: UpdateGoalResultInput): Promise<UpdateGoalResultOutput> {
    return this.work
      .run(async (store) => {
        const viewer = await requireViewer(store, input, true);
        const previous = await requireGoal(store, viewer, input.goalId, true, false);
        await requireResult(store, viewer, previous, input.resultId, true);
        requireVersion(previous, input);
        const goal = previous.updateResult(input.resultId, input.patch);
        if (goal !== previous) await store.goals.save(goal);
        return {
          result: await projectResult(store, viewer, goal, input.resultId),
          version: goal.snapshot.version,
        };
      })
      .catch(rethrowGoalFailure);
  }
  // #endregion
}
