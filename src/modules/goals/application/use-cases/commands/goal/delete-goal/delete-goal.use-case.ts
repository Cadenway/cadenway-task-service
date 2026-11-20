import type { GoalsUnitOfWork } from '../../../../ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import {
  requireGoal,
  requireVersion,
  requireViewer,
} from '../../../../services/goal/goal-access.service.js';
import type { DeleteGoalInput } from './delete-goal.input.js';
import type { DeleteGoalOutput } from './delete-goal.output.js';

/** Deletes a goal and its owned results atomically. */
export class DeleteGoal {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: GoalsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Authorizes and locks the goal before checking its version. */
  public execute(input: DeleteGoalInput): Promise<DeleteGoalOutput> {
    return this.work.run(async (store) => {
      const viewer = await requireViewer(store, input, true);
      const goal = await requireGoal(store, viewer, input.goalId, true);
      requireVersion(goal, input);
      await store.goals.delete(input.organizationId, input.goalId);
      return undefined;
    });
  }
  // #endregion
}
