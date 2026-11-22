import { principalOf, ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { ApplyAutomationTaskAction } from '../../../../application/use-cases/commands/task/apply-automation-task-action/apply-automation-task-action.use-case.js';
import { answerAutomationTaskRefusals } from '../../mappers/task/automation-task-action-refusal.mapper.js';
import { toAutomationTaskAction } from '../../mappers/task/automation-task-action.mapper.js';
import { keepActionProof } from '../../mappers/task/delegated-action-membership.mapper.js';

/** Rechecks the rule author's current task authority before a receipt can be replayed. */
@Injectable()
export class AutomationTaskActionReplayGuard implements CanActivate {
  // #region Constructor
  /** Uses the action's current authorization check. */
  public constructor(private readonly action: ApplyAutomationTaskAction) {}
  // #endregion

  // #region Methods
  /** Validates and authorizes the request before the idempotency interceptor runs. */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const input = toAutomationTaskAction(request);
    const principal = principalOf(request);
    if (principal === undefined) {
      throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
    }
    const proof = await runWithOrganizationContext(principal, () =>
      answerAutomationTaskRefusals(() => this.action.authorize(input)),
    );
    keepActionProof(request, proof);
    return true;
  }
  // #endregion
}
