import { rethrowGoalFailure } from '../../../../services/goal/goal-failure.service.js';
import type { GoalsUnitOfWork } from '../../../../ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import {
  requireGoal,
  requireVersion,
  requireViewer,
} from '../../../../services/goal/goal-access.service.js';
import { requireResult } from '../../../../services/goal/goal-result.service.js';
import type { DeleteGoalResultInput } from './delete-goal-result.input.js';
import type { DeleteGoalResultOutput } from './delete-goal-result.output.js';

/** Removes a visible result without changing its linked target. */
export class DeleteGoalResult {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: GoalsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Checks target visibility and the parent version under lock. */
  public execute(input: DeleteGoalResultInput): Promise<DeleteGoalResultOutput> {
    return this.work
      .run(async (store) => {
        const viewer = await requireViewer(store, input, true);
        const previous = await requireGoal(store, viewer, input.goalId, true, false);
        await requireResult(store, viewer, previous, input.resultId, true);
        requireVersion(previous, input);
        await store.goals.save(previous.removeResult(input.resultId));
        return undefined;
      })
      .catch(rethrowGoalFailure);
  }
  // #endregion
}
