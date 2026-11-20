import { Goal } from '../../../../../domain/aggregates/goal/goal.aggregate.js';
import type { GoalResult } from '../../../../../domain/value-objects/goal/goal-result.value-object.js';
import type { GoalsUnitOfWork } from '../../../../ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import {
  requireEligibleOwner,
  requireScope,
  requireViewer,
  requireVisibleTargets,
} from '../../../../services/goal/goal-access.service.js';
import { projectGoal } from '../../../../services/goal/goal-projection.service.js';
import type { CreateGoalInput } from './create-goal.input.js';
import type { CreateGoalOutput } from './create-goal.output.js';

/** Creates a goal and its initial results in one tenant transaction. */
export class CreateGoal {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(private readonly work: GoalsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Authorizes the placement, owner, and linked targets before inserting. */
  public execute(input: CreateGoalInput): Promise<CreateGoalOutput> {
    return this.work.run(async (store) => {
      const viewer = await requireViewer(store, input, true);
      await requireScope(store, viewer, input.spaceId, true, 'missing-space');
      const id = await store.goals.nextId();
      const results: GoalResult[] = [];
      for (const item of input.results) results.push({ ...item, id: await store.goals.nextId() });
      const goal = Goal.create({ ...input, id, results });
      await requireEligibleOwner(store, goal);
      await requireVisibleTargets(store, viewer, results, 'result-target-invalid');
      await store.goals.create(goal);
      return projectGoal(goal, input.today, await store.measureLinks(viewer, results, false));
    });
  }
  // #endregion
}
