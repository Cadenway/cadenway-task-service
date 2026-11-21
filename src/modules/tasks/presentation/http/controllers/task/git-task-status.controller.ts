import { ApplyGitTaskStatusActionInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Idempotent } from '@cadenway/nest-common/database';
import { Controller, Header, HttpCode, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { ApplyGitTaskStatus } from '../../../../application/use-cases/commands/task/apply-git-task-status/apply-git-task-status.use-case.js';
import { GitTaskActionFilter } from '../../errors/task/git-task-action.filter.js';
import { GitTaskActionReplayGuard } from '../../guards/task/git-task-action-replay.guard.js';
import { toGitTaskAction } from '../../mappers/task/git-task-action.mapper.js';
import { answerGitTaskRefusals } from '../../mappers/task/git-task-action-refusal.mapper.js';

/** Receives Task actions from Integration on behalf of a verified Git mapping. */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['integration-service'], actors: ['git'], organization: 'required' })
@UseFilters(GitTaskActionFilter)
export class GitTaskStatusController {
  // #region Constructor
  /** Binds the transactional action that rechecks the current mapping author's authority. */
  public constructor(private readonly action: ApplyGitTaskStatus) {}
  // #endregion

  // #region Methods
  /** Applies a forward transition or returns the authorized location without a change. */
  @Post(':taskKey/git-status-actions')
  @HttpCode(200)
  @Idempotent({ required: true, scope: 'actor', maxAttempts: 1 })
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(GitTaskActionReplayGuard)
  public async apply(
    @Req() request: Request,
  ): Promise<z.output<typeof ApplyGitTaskStatusActionInternalResponse>> {
    const input = toGitTaskAction(request);
    return answerGitTaskRefusals(async () =>
      ApplyGitTaskStatusActionInternalResponse.parse(await this.action.execute(input)),
    );
  }
  // #endregion
}
