import { InternalAccess } from '@cadenway/nest-common';
import type { AccessCheck } from '@cadenway/contracts/types/internal/task-service';
import { Controller, Get, Param } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { CheckTaskAccessOutput } from '../../../../application/use-cases/queries/task/check-task-access/check-task-access.output.js';
import { CheckTaskAccess } from '../../../../application/use-cases/queries/task/check-task-access/check-task-access.use-case.js';
import { TaskAccessPath } from '../../dto/input/access/task-access-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toAccessCheck } from '../../mappers/access/access-check.mapper.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/**
 * Class TaskAccessController
 *
 * @description
 * The access check of a task, `GET /internal/v1/tasks/{taskKey}/access` of
 * `openapi/internal/task-service.yaml`, which the realtime gateway calls before a socket joins the
 * room of a task. It accepts the issuer `realtime-gateway` only (any other answers
 * `403 auth.issuer-not-allowed`), with the actor `user` and an organization, which is why it is a
 * controller of its own: every other route of the tasks accepts `api-gateway` only. The actor and
 * the organization come from the verified internal token, never from the request. The controller
 * validates, maps and delegates: the visibility and the role belong to the use case.
 */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['realtime-gateway'], actors: ['user'], organization: 'required' })
export class TaskAccessController {
  // #region Properties
  /**
   * Property checkTaskAccess
   *
   * @description
   * Use case of the check.
   *
   * @type {CheckTaskAccess}
   * @readonly
   */
  private readonly checkTaskAccess: CheckTaskAccess;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use case, provided by `TasksModule`.
   *
   * @param {CheckTaskAccess} checkTaskAccess - Use case of the check.
   * @constructor
   */
  public constructor(checkTaskAccess: CheckTaskAccess) {
    this.checkTaskAccess = checkTaskAccess;
  }
  // #endregion

  // #region Methods
  /**
   * Method check
   *
   * @description
   * `GET /internal/v1/tasks/{taskKey}/access`: `200` with the role of the actor on the list of a
   * task they see, `404 task.not-found` for any other, never `task.trashed`. Nothing is written
   * and nothing is emitted.
   *
   * @param {TaskAccessPath} path - The key of the task.
   * @returns {Promise<AccessCheck>} The role and where the task is.
   * @throws {ProblemException} `404 task.not-found` or `404 organization.not-found`.
   */
  @Get(':taskKey/access')
  public async check(@Param() path: TaskAccessPath): Promise<AccessCheck> {
    const caller: Caller = toCaller();
    const access: CheckTaskAccessOutput = await answerRefusals(() =>
      this.checkTaskAccess.execute({ ...caller, taskKey: path.taskKey }),
    );
    return toAccessCheck(access);
  }
  // #endregion
}
