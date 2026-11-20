import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Header, HttpCode, Param, Query } from '@nestjs/common';

import { CheckTaskAttachmentAccess } from '../../../../application/use-cases/queries/task/check-task-attachment-access/check-task-attachment-access.use-case.js';
import { TaskAttachmentAccessPath } from '../../dto/input/access/task-attachment-access-path.dto.js';
import { TaskAttachmentAccessQuery } from '../../dto/input/access/task-attachment-access-query.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/** Authorizes the gateway's current attachment operation against a task snapshot. */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskAttachmentAccessController {
  // #region Constructor
  /** Binds the task attachment access query. */
  public constructor(private readonly checkTaskAttachmentAccess: CheckTaskAttachmentAccess) {}
  // #endregion

  // #region Methods
  /** Answers with no content only when the current actor has the requested access. */
  @Get(':taskKey/attachment-access')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  public async check(
    @Param() path: TaskAttachmentAccessPath,
    @Query() query: TaskAttachmentAccessQuery,
  ): Promise<void> {
    await answerRefusals(() =>
      this.checkTaskAttachmentAccess.execute({
        ...toCaller(),
        taskKey: path.taskKey,
        mode: query.mode,
      }),
    );
  }
  // #endregion
}
