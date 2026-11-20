import {
  CreateGoalInternalBody,
  CreateGoalInternalQueryParams,
  CreateGoalResultInternalBody,
  GetGoalInternalParams,
} from '@cadenway/contracts/validators/internal/task-service';
import { principalOf, ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { CreateGoal } from '../../../../application/use-cases/commands/goal/create-goal/create-goal.use-case.js';
import { CreateGoalResult } from '../../../../application/use-cases/commands/goal/create-goal-result/create-goal-result.use-case.js';
import { answerGoal } from '../../errors/goal/goal.problem.js';
import { goalCaller } from '../../mappers/goal/goal.mapper.js';
import { goalExpectedVersions } from '../../mappers/goal/goal-version.mapper.js';

/** Revalidates current access before an idempotent creation is replayed. */
@Injectable()
export class GoalReplayGuard implements CanActivate {
  // #region Constructor
  /** Binds the read-only authorization previews. */
  public constructor(
    private readonly create: CreateGoal,
    private readonly createResult: CreateGoalResult,
  ) {}
  // #endregion

  // #region Methods
  /** Validates version syntax even when the interceptor has a cached response. */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const expectedVersions =
      request.params.goalId === undefined
        ? null
        : goalExpectedVersions(request.headers['if-match']);
    if (request.headers['idempotency-key'] === undefined) return true;
    const principal = principalOf(request);
    if (principal === undefined)
      throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
    if (request.params.goalId === undefined) {
      const body = CreateGoalInternalBody.safeParse(request.body);
      const query = CreateGoalInternalQueryParams.safeParse(request.query);
      if (!body.success || !query.success) return true;
      await runWithOrganizationContext(principal, () =>
        answerGoal(() =>
          this.create.assertCanReplay({
            ...goalCaller(),
            ...body.data,
            spaceId: body.data.spaceId ?? null,
            results: body.data.results ?? [],
            today: query.data.today,
          }),
        ),
      );
    } else {
      const path = GetGoalInternalParams.safeParse(request.params);
      const result = CreateGoalResultInternalBody.safeParse(request.body);
      if (!path.success || !result.success) return true;
      await runWithOrganizationContext(principal, () =>
        answerGoal(() =>
          this.createResult.assertCanReplay({
            ...goalCaller(),
            goalId: path.data.goalId.toLowerCase(),
            result: result.data,
            expectedVersions,
          }),
        ),
      );
    }
    return true;
  }
  // #endregion
}
