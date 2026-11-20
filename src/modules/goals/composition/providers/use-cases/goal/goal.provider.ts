import type { FactoryProvider } from '@nestjs/common';

import type { GoalsUnitOfWork } from '../../../../application/ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import { CreateGoalResult } from '../../../../application/use-cases/commands/goal/create-goal-result/create-goal-result.use-case.js';
import { CreateGoal } from '../../../../application/use-cases/commands/goal/create-goal/create-goal.use-case.js';
import { DeleteGoalResult } from '../../../../application/use-cases/commands/goal/delete-goal-result/delete-goal-result.use-case.js';
import { DeleteGoal } from '../../../../application/use-cases/commands/goal/delete-goal/delete-goal.use-case.js';
import { UpdateGoalResult } from '../../../../application/use-cases/commands/goal/update-goal-result/update-goal-result.use-case.js';
import { UpdateGoal } from '../../../../application/use-cases/commands/goal/update-goal/update-goal.use-case.js';
import { GetGoalResult } from '../../../../application/use-cases/queries/goal/get-goal-result/get-goal-result.use-case.js';
import { GetGoal } from '../../../../application/use-cases/queries/goal/get-goal/get-goal.use-case.js';
import { ListGoals } from '../../../../application/use-cases/queries/goal/list-goals/list-goals.use-case.js';
import { GOALS_UNIT_OF_WORK } from '../../../tokens/goal/goals-unit-of-work.token.js';

const useCases = [
  CreateGoal,
  CreateGoalResult,
  DeleteGoal,
  DeleteGoalResult,
  GetGoal,
  GetGoalResult,
  ListGoals,
  UpdateGoal,
  UpdateGoalResult,
] as const;

/** Binds each goal operation to the same tenant transaction port. */
export const goalUseCaseProviders: readonly FactoryProvider[] = useCases.map((UseCase) => ({
  provide: UseCase,
  inject: [GOALS_UNIT_OF_WORK],
  useFactory: (work: GoalsUnitOfWork) => new UseCase(work),
}));
