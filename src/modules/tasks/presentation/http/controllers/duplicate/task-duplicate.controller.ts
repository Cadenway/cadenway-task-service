import type { Task } from '@cadenway/contracts/types/internal/task-service';
import { formatEtag, InternalAccess } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { DuplicateTask } from '../../../../application/use-cases/commands/task/duplicate-task/duplicate-task.use-case.js';
import { DuplicateTaskBody } from '../../dto/input/duplicate/duplicate-task-body.dto.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toTask } from '../../mappers/task/task.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';
import { requireDuplicateBody } from '../../validation/duplicate/required-duplicate-body.validator.js';
import { RequiredDuplicateBodyGuard } from '../../guards/duplicate/required-duplicate-body.guard.js';

/** Duplicates a visible editable task under the verified organization context. */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskDuplicateController {
  // #region Constructor
  /** Binds the task duplication use case. */
  public constructor(private readonly duplicateTask: DuplicateTask) {}
  // #endregion

  // #region Methods
  /** Creates a task copy and returns its location and version ETag. */
  @Post(':taskKey/duplicate')
  @HttpCode(201)
  @UseGuards(RequiredDuplicateBodyGuard)
  public async duplicate(
    @Param() path: TaskPath,
    @Body() _body: DuplicateTaskBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Task> {
    requireDuplicateBody(request);
    const result = await answerRefusals(() =>
      this.duplicateTask.execute({
        ...toCaller(),
        taskKey: path.taskKey,
        expectedVersions: toExpectedVersions(ifMatch),
      }),
    );
    response.setHeader('Location', `/internal/v1/tasks/${result.key}`);
    response.setHeader('ETag', formatEtag(result.version));
    return toTask(result);
  }
  // #endregion
}
