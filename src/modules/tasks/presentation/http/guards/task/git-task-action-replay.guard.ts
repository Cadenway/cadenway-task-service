import { principalOf, ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { ApplyGitTaskStatus } from '../../../../application/use-cases/commands/task/apply-git-task-status/apply-git-task-status.use-case.js';
import { toGitTaskAction } from '../../mappers/task/git-task-action.mapper.js';
import { answerGitTaskRefusals } from '../../mappers/task/git-task-action-refusal.mapper.js';

/** Rechecks current task and mapping-author authority before a receipt can be replayed. */
@Injectable()
export class GitTaskActionReplayGuard implements CanActivate {
  // #region Constructor
  /** Binds the same authorization used by the action transaction. */
  public constructor(private readonly action: ApplyGitTaskStatus) {}
  // #endregion

  // #region Methods
  /** Validates the request and rechecks the authorized placement before the interceptor runs. */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const input = toGitTaskAction(request);
    const principal = principalOf(request);
    if (principal === undefined) {
      throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
    }
    await runWithOrganizationContext(principal, () =>
      answerGitTaskRefusals(() => this.action.authorize(input)),
    );
    return true;
  }
  // #endregion
}
