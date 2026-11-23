import type { TaskVisibility } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess, ProblemException } from '@cadenway/nest-common';
import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';

import { GetTaskVisibility } from '../../../../application/use-cases/queries/task/get-task-visibility/get-task-visibility.use-case.js';
import { TaskVisibilityBody } from '../../dto/input/task/task-visibility-body.dto.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/** Resolves a batch of task keys visible to the API gateway's verified user. */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskVisibilityController {
  // #region Constructor
  /** Binds the batch visibility query. */
  public constructor(private readonly visibility: GetTaskVisibility) {}
  // #endregion

  // #region Methods
  /** Returns the visible subset in request order or refuses an unreliable decision. */
  @Post('visibility')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async resolve(@Body() body: TaskVisibilityBody): Promise<TaskVisibility> {
    const caller = toCaller();
    try {
      const result = await this.visibility.execute({ ...caller, taskKeys: body.taskKeys });
      return { visibleTaskKeys: [...result.visibleTaskKeys] };
    } catch {
      throw new ProblemException({
        status: 503,
        code: 'task.visibility-unavailable',
      });
    }
  }
  // #endregion
}
