import { principalOf, ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { ApplyAutomationTaskComment } from '../../../../application/use-cases/commands/comment/apply-automation-task-comment/apply-automation-task-comment.use-case.js';
import { answerAutomationComment } from '../../mappers/comment/automation-comment-refusal.mapper.js';
import { toAutomationComment } from '../../mappers/comment/automation-comment.mapper.js';

/** Checks the author's current authority before the idempotency interceptor reads a receipt. */
@Injectable()
export class AutomationCommentReplayGuard implements CanActivate {
  // #region Constructor
  /** Uses the comment write operation's authorization path. */
  public constructor(private readonly comments: ApplyAutomationTaskComment) {}
  // #endregion

  // #region Methods
  /** Rejects an unavailable task before a new command or replay. */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const input = toAutomationComment(request);
    const principal = principalOf(request);
    if (principal === undefined)
      throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
    const allowed = await runWithOrganizationContext(principal, () =>
      answerAutomationComment(() =>
        this.comments.authorize({
          organizationId: input.organizationId,
          taskKey: input.taskKey,
          ruleAuthorUserId: input.ruleAuthorUserId,
        }),
      ),
    );
    if (!allowed) throw new ProblemException({ status: 404, code: 'task.not-found' });
    return true;
  }
  // #endregion
}
