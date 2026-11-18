import { formatEtag, InternalAccess } from '@cadenway/nest-common';
import type { Task, TaskDetailCore } from '@cadenway/contracts/types/internal/task-service';
import { Body, Controller, Get, Headers, Param, Patch, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { UpdateTaskOutput } from '../../../../application/use-cases/commands/task/update-task/update-task.output.js';
import { UpdateTask } from '../../../../application/use-cases/commands/task/update-task/update-task.use-case.js';
import type { GetTaskDetailOutput } from '../../../../application/use-cases/queries/task/get-task-detail/get-task-detail.output.js';
import { GetTaskDetail } from '../../../../application/use-cases/queries/task/get-task-detail/get-task-detail.use-case.js';
import type { GetTaskOutput } from '../../../../application/use-cases/queries/task/get-task/get-task.output.js';
import { GetTask } from '../../../../application/use-cases/queries/task/get-task/get-task.use-case.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { UpdateTaskBody } from '../../dto/input/task/update-task-body.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toTaskDetail } from '../../mappers/task/task-detail.mapper.js';
import { editsDescription, toTaskChange } from '../../mappers/task/task-patch.mapper.js';
import { toTask } from '../../mappers/task/task.mapper.js';
import { toVersionCondition } from '../../mappers/version/version-condition.mapper.js';

/**
 * Class TasksController
 *
 * @description
 * The task itself, `GET` and `PATCH /internal/v1/tasks/{taskKey}` and `GET
 * /internal/v1/tasks/{taskKey}/detail` of `openapi/internal/task-service.yaml`. They accept the
 * issuer `api-gateway` only, with the actor `user` and an organization. The actor and the
 * organization come from the verified internal token, never from the request. The `ETag`
 * (`"<version>"`) of a task is set by the `EtagInterceptor` of the kit from the `version` of the
 * body; the detail sets it itself, its body having no `version` at the top level. The controller
 * validates, maps and delegates: the visibility of the task, the rules and the transaction belong
 * to the use cases.
 */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TasksController {
  // #region Properties
  /**
   * Property getTask
   *
   * @description
   * Use case of the reading.
   *
   * @type {GetTask}
   * @readonly
   */
  private readonly getTask: GetTask;

  /**
   * Property getTaskDetail
   *
   * @description
   * Use case of the detail.
   *
   * @type {GetTaskDetail}
   * @readonly
   */
  private readonly getTaskDetail: GetTaskDetail;

  /**
   * Property updateTask
   *
   * @description
   * Use case of the change.
   *
   * @type {UpdateTask}
   * @readonly
   */
  private readonly updateTask: UpdateTask;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `TasksModule`.
   *
   * @param {GetTask} getTask - Use case of the reading.
   * @param {GetTaskDetail} getTaskDetail - Use case of the detail.
   * @param {UpdateTask} updateTask - Use case of the change.
   * @constructor
   */
  public constructor(getTask: GetTask, getTaskDetail: GetTaskDetail, updateTask: UpdateTask) {
    this.getTask = getTask;
    this.getTaskDetail = getTaskDetail;
    this.updateTask = updateTask;
  }
  // #endregion

  // #region Methods
  /**
   * Method read
   *
   * @description
   * `GET /internal/v1/tasks/{taskKey}`: `200` with a task the actor sees, `404 task.not-found` for
   * any other.
   *
   * @param {TaskPath} path - The key of the task.
   * @returns {Promise<Task>} The task.
   * @throws {ProblemException} `404 task.not-found` or `404 organization.not-found`.
   */
  @Get(':taskKey')
  public async read(@Param() path: TaskPath): Promise<Task> {
    const caller: Caller = toCaller();
    const view: GetTaskOutput = await answerRefusals(() =>
      this.getTask.execute({ ...caller, taskKey: path.taskKey }),
    );
    return toTask(view);
  }

  /**
   * Method detail
   *
   * @description
   * `GET /internal/v1/tasks/{taskKey}/detail`: `200` with the task, its space, its list, its
   * parent and its direct subtasks, read in one transaction. The `ETag` is the version of the
   * task, set here since the body has no `version` at the top level.
   *
   * @param {TaskPath} path - The key of the task.
   * @param {Response} response - The response, for `ETag`.
   * @returns {Promise<TaskDetailCore>} The detail.
   * @throws {ProblemException} `404 task.not-found` or `404 organization.not-found`.
   */
  @Get(':taskKey/detail')
  public async detail(
    @Param() path: TaskPath,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TaskDetailCore> {
    const caller: Caller = toCaller();
    const view: GetTaskDetailOutput = await answerRefusals(() =>
      this.getTaskDetail.execute({ ...caller, taskKey: path.taskKey }),
    );
    response.setHeader('ETag', formatEtag(view.task.version));
    return toTaskDetail(view);
  }

  /**
   * Method update
   *
   * @description
   * `PATCH /internal/v1/tasks/{taskKey}`: `200` with the task after the merge patch, the same
   * version when nothing changed. `If-Match` is optional, except when the body has a
   * `description`, the one member that edits a long text: without the header, `400 request.invalid`
   * with one issue on `If-Match` (`invalid_type`). `404 task.not-found`, `412
   * request.version-mismatch` with `details.version` and the `422` refusals of a task come from
   * the use case.
   *
   * @param {TaskPath} path - The key of the task.
   * @param {UpdateTaskBody} body - The merge patch.
   * @param {string | undefined} ifMatch - The `If-Match` header.
   * @returns {Promise<Task>} The task after the change.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed or a
   * missing required `If-Match`.
   */
  @Patch(':taskKey')
  public async update(
    @Param() path: TaskPath,
    @Body() body: UpdateTaskBody,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<Task> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toVersionCondition(
      ifMatch,
      editsDescription(body),
    );
    const view: UpdateTaskOutput = await answerRefusals(() =>
      this.updateTask.execute({
        ...caller,
        taskKey: path.taskKey,
        expectedVersions,
        patch: toTaskChange(body),
      }),
    );
    return toTask(view);
  }
  // #endregion
}
