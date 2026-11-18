import type { Task } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { CreateTaskOutput } from '../../../../application/use-cases/commands/task/create-task/create-task.output.js';
import { CreateTask } from '../../../../application/use-cases/commands/task/create-task/create-task.use-case.js';
import { CreateTaskBody } from '../../dto/input/task/create-task-body.dto.js';
import { ListTasksPath } from '../../dto/input/task/list-tasks-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toCreateTaskInput } from '../../mappers/task/task-creation.mapper.js';
import { toTask } from '../../mappers/task/task.mapper.js';

/**
 * Class ListTasksController
 *
 * @description
 * The creation of a task in a list, `POST /internal/v1/lists/{listId}/tasks` of
 * `openapi/internal/task-service.yaml`, which the gateway calls for `POST /v1/lists/{listId}/tasks`.
 * It accepts the issuer `api-gateway` only, with the actor `user` and an organization. The actor
 * and the organization come from the verified internal token, never from the request. The
 * controller validates, maps and delegates: the visibility of the list, the rules of the task, the
 * keys and the transaction belong to the use case.
 */
@Controller('internal/v1/lists')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class ListTasksController {
  // #region Properties
  /**
   * Property createTask
   *
   * @description
   * Use case of the creation.
   *
   * @type {CreateTask}
   * @readonly
   */
  private readonly createTask: CreateTask;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use case, provided by `TasksModule`.
   *
   * @param {CreateTask} createTask - Use case of the creation.
   * @constructor
   */
  public constructor(createTask: CreateTask) {
    this.createTask = createTask;
  }
  // #endregion

  // #region Methods
  /**
   * Method create
   *
   * @description
   * `POST /internal/v1/lists/{listId}/tasks`: `201` with the task and `Location:
   * /internal/v1/tasks/<key>`; the `ETag` (`"<version>"`, `"1"`) comes from the `version` of the
   * body, set by the `EtagInterceptor` of the kit. The subtasks of the body are created with the
   * task, in the same transaction, each with the next key. With an `Idempotency-Key` (applied by
   * `tasks.module.ts`) the kit records the answer for 24 hours and replays it with the recorded
   * `Location` and `ETag`. `404 list.not-found` and the `422` refusals of a task come from the
   * use case.
   *
   * @param {ListTasksPath} path - The id of the list.
   * @param {CreateTaskBody} body - The task, with the defaults of the contract applied.
   * @param {Response} response - The response, for `Location`.
   * @returns {Promise<Task>} The task.
   * @throws {ProblemException} `404 list.not-found`, `404 organization.not-found` or
   * `422 task.status-hidden`, `task.cancel-reason-required`, `task.cancel-reason-unexpected`,
   * `task.assignee-invalid` or `task.start-date-invalid`.
   */
  @Post(':listId/tasks')
  @HttpCode(201)
  public async create(
    @Param() path: ListTasksPath,
    @Body() body: CreateTaskBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Task> {
    const caller: Caller = toCaller();
    const created: CreateTaskOutput = await answerRefusals(() =>
      this.createTask.execute(toCreateTaskInput(caller, path.listId, body)),
    );
    response.setHeader('Location', `/internal/v1/tasks/${created.key}`);
    return toTask(created);
  }
  // #endregion
}
