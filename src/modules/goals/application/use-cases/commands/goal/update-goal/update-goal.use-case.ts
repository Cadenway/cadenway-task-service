import { rethrowGoalFailure } from '../../../../services/goal/goal-failure.service.js';
import type { GoalsUnitOfWork } from '../../../../ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import {
  requireEligibleOwner,
  requireGoal,
  requireVersion,
  requireViewer,
} from '../../../../services/goal/goal-access.service.js';
import { projectGoal } from '../../../../services/goal/goal-projection.service.js';
import type { UpdateGoalInput } from './update-goal.input.js';
import type { UpdateGoalOutput } from './update-goal.output.js';

/** Updates a goal's writable metadata without changing its placement. */
export class UpdateGoal {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: GoalsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Checks permissions and version before invoking the aggregate. */
  public execute(input: UpdateGoalInput): Promise<UpdateGoalOutput> {
    return this.work
      .run(async (store) => {
        const viewer = await requireViewer(store, input, true);
        const previous = await requireGoal(store, viewer, input.goalId, true);
        requireVersion(previous, input);
        const goal = previous.update(input.patch);
        await requireEligibleOwner(store, goal);
        if (goal !== previous) await store.goals.save(goal);
        return projectGoal(
          goal,
          input.today,
          await store.measureLinks(viewer, goal.snapshot.results, false),
        );
      })
      .catch(rethrowGoalFailure);
  }
  // #endregion
}
