import { rethrowGoalFailure } from '../../../../services/goal/goal-failure.service.js';
import type { GoalsUnitOfWork } from '../../../../ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import { GoalError } from '../../../../models/goal/goal-error.model.js';
import {
  requireGoal,
  requireScope,
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
    return this.work
      .run(async (store) => {
        const viewer = await requireViewer(store, input, true);
        const previous = await requireGoal(store, viewer, input.goalId, true, false);
        const result = { ...input.result, id: await store.goals.nextId() };
        await requireVisibleTargets(
          store,
          viewer,
          [result],
          'result-target-invalid',
          true,
          previous.snapshot.spaceId,
          'missing-goal',
        );
        requireVersion(previous, input);
        const goal = previous.addResult(result);
        await store.goals.save(goal);
        return {
          result: await projectResult(store, viewer, goal, result.id),
          version: goal.snapshot.version,
        };
      })
      .catch(rethrowGoalFailure);
  }

  /** Revalidates current rights and target visibility before returning a stored response. */
  public async assertCanReplay(input: CreateGoalResultInput): Promise<void> {
    await this.work
      .read(async (store) => {
        const viewer = await requireViewer(store, input, false);
        const record = await store.goals.find(viewer.organizationId, input.goalId, false);
        if (record === null) throw new GoalError({ reason: 'missing-goal' });
        await requireScope(
          store,
          viewer,
          record.goal.snapshot.spaceId,
          true,
          'missing-goal',
          false,
        );
        await requireVisibleTargets(store, viewer, [input.result], 'result-target-invalid', false);
      })
      .catch(rethrowGoalFailure);
  }
  // #endregion
}
