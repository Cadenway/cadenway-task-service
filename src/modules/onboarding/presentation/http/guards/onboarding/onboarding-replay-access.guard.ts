import { principalOf, ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { FinishOnboarding } from '../../../../application/use-cases/commands/onboarding/finish-onboarding/finish-onboarding.use-case.js';
import { OnboardingPath } from '../../dto/input/onboarding/onboarding-path.dto.js';
import { answerOnboarding } from '../../errors/onboarding/onboarding.problem.js';
import { onboardingActor } from '../../mappers/onboarding/onboarding.mapper.js';

/** Rechecks the verified actor's current membership before idempotent replay. */
@Injectable()
export class OnboardingReplayAccessGuard implements CanActivate {
  // #region Constructor
  /** Binds the current membership check. */
  public constructor(private readonly finish: FinishOnboarding) {}
  // #endregion

  // #region Methods
  /** Checks the verified principal before replay. */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers['idempotency-key'] === undefined) return true;
    const path = OnboardingPath.schema.safeParse(request.params);
    if (!path.success) return true;
    const principal = principalOf(request);
    if (principal === undefined)
      throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
    await runWithOrganizationContext(principal, () =>
      answerOnboarding(() => this.finish.assertCanReplay(onboardingActor(path.data.userId))),
    );
    return true;
  }
  // #endregion
}
