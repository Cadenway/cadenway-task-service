import type { GoalsUnitOfWork } from '../../../../ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import {
  requireGoal,
  requireVersion,
  requireViewer,
  requireVisibleTargets,
} from '../../../../services/goal/goal-access.service.js';
import { projectResult } from '../../../../services/goal/goal-result.service.js';
import type { CreateGoalResultInput } from './create-goal-result.input.js';
import type { CreateGoalResultOutput } from './create-goal-result.output.js';

/** Adds one key result to a writable goal. */
export class CreateGoalResult {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: GoalsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Validates the target under lock before changing the aggregate. */
  public execute(input: CreateGoalResultInput): Promise<CreateGoalResultOutput> {
    return this.work.run(async (store) => {
      const viewer = await requireViewer(store, input, true);
      const previous = await requireGoal(store, viewer, input.goalId, true);
      requireVersion(previous, input);
      const result = { ...input.result, id: await store.goals.nextId() };
      await requireVisibleTargets(store, viewer, [result], 'result-target-invalid');
      const goal = previous.addResult(result);
      await store.goals.save(goal);
      return {
        result: await projectResult(store, viewer, goal, result.id),
        version: goal.snapshot.version,
      };
    });
  }
  // #endregion
}
