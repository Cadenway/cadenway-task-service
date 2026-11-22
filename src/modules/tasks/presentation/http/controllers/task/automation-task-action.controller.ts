import { ApplyAutomationTaskActionInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Idempotent } from '@cadenway/nest-common/database';
import { Controller, Header, HttpCode, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { ApplyAutomationTaskAction } from '../../../../application/use-cases/commands/task/apply-automation-task-action/apply-automation-task-action.use-case.js';
import { TaskActionFilter } from '../../errors/task/task-action.filter.js';
import { AutomationTaskActionReplayGuard } from '../../guards/task/automation-task-action-replay.guard.js';
import { answerAutomationTaskRefusals } from '../../mappers/task/automation-task-action-refusal.mapper.js';
import { toAutomationTaskAction } from '../../mappers/task/automation-task-action.mapper.js';
import { actionProofOf } from '../../mappers/task/delegated-action-membership.mapper.js';

/** Applies an Automation rule's task action using the rule author's current authority. */
@Controller('internal/v1/tasks')
@UseFilters(TaskActionFilter)
@InternalAccess({
  issuers: ['automation-service'],
  actors: ['automation'],
  organization: 'required',
})
export class AutomationTaskActionController {
  // #region Constructor
  /** Binds the action and its transactional authorization. */
  public constructor(private readonly action: ApplyAutomationTaskAction) {}
  // #endregion

  // #region Methods
  /** Returns the contract receipt after a committed action or a no-op. */
  @Post(':taskKey/automation-actions')
  @HttpCode(200)
  @Idempotent({ required: true, scope: 'actor', maxAttempts: 1 })
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(AutomationTaskActionReplayGuard)
  public async apply(
    @Req() request: Request,
  ): Promise<z.output<typeof ApplyAutomationTaskActionInternalResponse>> {
    const input = toAutomationTaskAction(request);
    return answerAutomationTaskRefusals(async () =>
      ApplyAutomationTaskActionInternalResponse.parse(
        await this.action.execute(input, actionProofOf(request)),
      ),
    );
  }
  // #endregion
}
