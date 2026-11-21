import { ApplyAutomationTaskCommentInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { InternalAccess, ProblemException, ProblemFilter } from '@cadenway/nest-common';
import { Idempotent } from '@cadenway/nest-common/database';
import {
  Catch,
  Controller,
  Header,
  HttpCode,
  HttpException,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';

import { ApplyAutomationTaskComment } from '../../../../application/use-cases/commands/comment/apply-automation-task-comment/apply-automation-task-comment.use-case.js';
import { AutomationCommentReplayGuard } from '../../guards/comment/automation-comment-replay.guard.js';
import { answerAutomationComment } from '../../mappers/comment/automation-comment-refusal.mapper.js';
import { toAutomationComment } from '../../mappers/comment/automation-comment.mapper.js';

/** Keeps private error responses generic throughout the action pipeline. */
@Catch()
export class AutomationCommentFilter extends ProblemFilter {
  // #region Methods
  /** Emits only the published client errors and a generic service refusal. */
  public override catch(exception: unknown, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'private, no-store');
    const problem =
      exception instanceof HttpException && exception.getStatus() < 500
        ? exception
        : new ProblemException({ status: 503, code: 'task.action-unavailable' });
    super.catch(problem, host);
  }
  // #endregion
}

/** Creates a rule-authored comment under the rule author's current access. */
@Controller('internal/v1/tasks')
@InternalAccess({
  issuers: ['automation-service'],
  actors: ['automation'],
  organization: 'required',
})
@UseFilters(AutomationCommentFilter)
export class AutomationCommentController {
  // #region Constructor
  /** Uses the existing transaction-owning comment operation. */
  public constructor(private readonly comments: ApplyAutomationTaskComment) {}
  // #endregion

  // #region Methods
  /** Returns only the published receipt after the atomic comment write. */
  @Post(':taskKey/automation-comments')
  @HttpCode(200)
  @Idempotent({ required: true, scope: 'actor', maxAttempts: 1 })
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(AutomationCommentReplayGuard)
  public async apply(
    @Req() request: Request,
  ): Promise<z.output<typeof ApplyAutomationTaskCommentInternalResponse>> {
    const input = toAutomationComment(request);
    await answerAutomationComment(() => this.comments.execute(input));
    return ApplyAutomationTaskCommentInternalResponse.parse({ disposition: 'applied' });
  }
  // #endregion
}
