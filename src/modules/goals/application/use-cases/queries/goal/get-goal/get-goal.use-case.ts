import type { GoalsUnitOfWork } from '../../../../ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import { requireGoal, requireViewer } from '../../../../services/goal/goal-access.service.js';
import { projectGoal } from '../../../../services/goal/goal-projection.service.js';
import type { GetGoalInput } from './get-goal.input.js';
import type { GetGoalOutput } from './get-goal.output.js';

/** Reads one currently visible goal and linked progress. */
export class GetGoal {
  // #region Constructor
  /** Binds the read snapshot. */
  public constructor(private readonly work: GoalsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Authorizes the current caller in the same snapshot as the projections. */
  public execute(input: GetGoalInput): Promise<GetGoalOutput> {
    return this.work.read(async (store) => {
      const viewer = await requireViewer(store, input, false);
      const goal = await requireGoal(store, viewer, input.goalId, false);
      const links = await store.measureLinks(viewer, goal.snapshot.results, false);
      return projectGoal(goal, input.today, links);
    });
  }
  // #endregion
}
