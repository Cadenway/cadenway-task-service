import type {
  Task,
  TaskSummaryPage as TaskSummaryPageBody,
} from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { CreateSubtaskOutput } from '../../../../application/use-cases/commands/subtask/create-subtask/create-subtask.output.js';
import { CreateSubtask } from '../../../../application/use-cases/commands/subtask/create-subtask/create-subtask.use-case.js';
import type { ListSubtasksOutput } from '../../../../application/use-cases/queries/subtask/list-subtasks/list-subtasks.output.js';
import { ListSubtasks } from '../../../../application/use-cases/queries/subtask/list-subtasks/list-subtasks.use-case.js';
import { CreateSubtaskBody } from '../../dto/input/subtask/create-subtask-body.dto.js';
import { ListSubtasksQuery } from '../../dto/input/subtask/list-subtasks-query.dto.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toSubtasksPosition } from '../../mappers/subtask/subtask-cursor.mapper.js';
import { toSubtaskPage } from '../../mappers/subtask/subtask-page.mapper.js';
import { toCreateSubtaskInput } from '../../mappers/task/task-creation.mapper.js';
import { toTask } from '../../mappers/task/task.mapper.js';

/**
 * Class SubtasksController
 *
 * @description
 * The subtasks of a task, `GET` and `POST /internal/v1/tasks/{taskKey}/subtasks` of
 * `openapi/internal/task-service.yaml`. They accept the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal
 * token, never from the request. The controller validates, maps and delegates: the visibility of
 * the parent, the rules of the task, the key and the transaction belong to the use cases.
 */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class SubtasksController {
  // #region Properties
  /**
   * Property createSubtask
   *
   * @description
   * Use case of the creation.
   *
   * @type {CreateSubtask}
   * @readonly
   */
  private readonly createSubtask: CreateSubtask;

  /**
   * Property listSubtasks
   *
   * @description
   * Use case of the list.
   *
   * @type {ListSubtasks}
   * @readonly
   */
  private readonly listSubtasks: ListSubtasks;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `TasksModule`.
   *
   * @param {CreateSubtask} createSubtask - Use case of the creation.
   * @param {ListSubtasks} listSubtasks - Use case of the list.
   * @constructor
   */
  public constructor(createSubtask: CreateSubtask, listSubtasks: ListSubtasks) {
    this.createSubtask = createSubtask;
    this.listSubtasks = listSubtasks;
  }
  // #endregion

  // #region Methods
  /**
   * Method list
   *
   * @description
   * `GET /internal/v1/tasks/{taskKey}/subtasks`: `200` with one page of the direct subtasks of a
   * task the actor sees, in the order of their creation, and their number in `total`.
   *
   * @param {TaskPath} path - The key of the parent.
   * @param {ListSubtasksQuery} query - The cursor and the page size.
   * @returns {Promise<TaskSummaryPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this task,
   * `404 task.not-found` or `404 organization.not-found`.
   */
  @Get(':taskKey/subtasks')
  public async list(
    @Param() path: TaskPath,
    @Query() query: ListSubtasksQuery,
  ): Promise<TaskSummaryPageBody> {
    const caller: Caller = toCaller();
    const page: ListSubtasksOutput = await answerRefusals(() =>
      this.listSubtasks.execute({
        ...caller,
        taskKey: path.taskKey,
        after: toSubtasksPosition(query.cursor, path.taskKey),
        limit: query.limit,
      }),
    );
    return toSubtaskPage(page, path.taskKey);
  }

  /**
   * Method create
   *
   * @description
   * `POST /internal/v1/tasks/{taskKey}/subtasks`: `201` with the subtask (its own key and version)
   * and `Location: /internal/v1/tasks/<subtaskKey>`; the `ETag` comes from the `version` of the
   * body, set by the `EtagInterceptor` of the kit. With an `Idempotency-Key` (applied by
   * `tasks.module.ts`) the kit records the answer for 24 hours and replays it with the recorded
   * `Location` and `ETag`. `404 task.not-found` for the parent, `422 task.subtask-depth-exceeded`,
   * `422 task.subtask-limit-reached` and the refusals of a creation come from the use case.
   *
   * @param {TaskPath} path - The key of the parent.
   * @param {CreateSubtaskBody} body - The subtask, with the defaults of the contract applied.
   * @param {Response} response - The response, for `Location`.
   * @returns {Promise<Task>} The subtask.
   * @throws {ProblemException} The refusals above.
   */
  @Post(':taskKey/subtasks')
  @HttpCode(201)
  public async create(
    @Param() path: TaskPath,
    @Body() body: CreateSubtaskBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Task> {
    const caller: Caller = toCaller();
    const created: CreateSubtaskOutput = await answerRefusals(() =>
      this.createSubtask.execute(toCreateSubtaskInput(caller, path.taskKey, body)),
    );
    response.setHeader('Location', `/internal/v1/tasks/${created.key}`);
    return toTask(created);
  }
  // #endregion
}
