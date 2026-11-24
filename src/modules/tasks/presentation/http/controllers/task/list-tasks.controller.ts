import type {
  Task,
  TaskSummaryPage as TaskSummaryPageBody,
} from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  QueryMethod,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { TaskFilterInput } from '../../../../application/models/query/task-filter-input.model.js';
import type { CreateTaskOutput } from '../../../../application/use-cases/commands/task/create-task/create-task.output.js';
import { CreateTask } from '../../../../application/use-cases/commands/task/create-task/create-task.use-case.js';
import type { ListListTasksOutput } from '../../../../application/use-cases/queries/list/list-list-tasks/list-list-tasks.output.js';
import { ListListTasks } from '../../../../application/use-cases/queries/list/list-list-tasks/list-list-tasks.use-case.js';
import { CreateTaskBody } from '../../dto/input/task/create-task-body.dto.js';
import { CreateTaskPath } from '../../dto/input/task/create-task-path.dto.js';
import { ListTasksPath } from '../../dto/input/task/list-tasks-path.dto.js';
import { ListTasksQuery } from '../../dto/input/task/list-tasks-query.dto.js';
import { QueryListTasksBody } from '../../dto/input/task/query-list-tasks-body.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { RequiredDuplicateBodyGuard } from '../../guards/duplicate/required-duplicate-body.guard.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toTaskCursor, toTaskPosition } from '../../mappers/query/task-cursor.mapper.js';
import { toTaskFilterInput, toTaskOrder } from '../../mappers/query/task-filter.mapper.js';
import { toTaskSummaryPage } from '../../mappers/query/task-summary-page.mapper.js';
import { toCreateTaskInput } from '../../mappers/task/task-creation.mapper.js';
import { toTask } from '../../mappers/task/task.mapper.js';

/**
 * Class ListTasksController
 *
 * @description
 * The tasks of a list, `/internal/v1/lists/{listId}/tasks` of `openapi/internal/task-service.yaml`:
 * the creation (`POST`), which the gateway calls for `POST /v1/lists/{listId}/tasks`, and the
 * filtered, sorted and paged reading (`GET`).
 * It accepts the issuer `api-gateway` only, with the actor `user` and an organization. The actor
 * and the organization come from the verified internal token, never from the request. The
 * controller validates, maps and delegates: the visibility of the list, the rules of the task, the
 * keys and the transaction belong to the use case, and so do the visibility of the list and the
 * filters of the reading. The reading carries no `ETag`: the contract declares none.
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

  /**
   * Property listListTasks
   *
   * @description
   * Use case of the reading.
   *
   * @type {ListListTasks}
   * @readonly
   */
  private readonly listListTasks: ListListTasks;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `TasksModule`.
   *
   * @param {CreateTask} createTask - Use case of the creation.
   * @param {ListListTasks} listListTasks - Use case of the reading.
   * @constructor
   */
  public constructor(createTask: CreateTask, listListTasks: ListListTasks) {
    this.createTask = createTask;
    this.listListTasks = listListTasks;
  }
  // #endregion

  // #region Methods
  /**
   * Method list
   *
   * @description
   * `GET /internal/v1/lists/{listId}/tasks`: `200` with one page of the tasks of the list the
   * actor sees, kept to the filters of the query (`?status=progress,review&assignee=me,none`: the
   * values of a filter add up, the filters narrow each other), by default the top-level tasks in
   * the order of the list, and the number of tasks that match them. `cursor` continues the same
   * collection in the same order.
   *
   * @param {ListTasksPath} path - The id of the list.
   * @param {ListTasksQuery} query - The filters, the sort, the cursor and the page size.
   * @returns {Promise<TaskSummaryPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
   * collection, `404 list.not-found` or `404 organization.not-found`.
   */
  @Get(':listId/tasks')
  public async list(
    @Param() path: ListTasksPath,
    @Query() query: ListTasksQuery,
  ): Promise<TaskSummaryPageBody> {
    const caller: Caller = toCaller();
    const filter: TaskFilterInput = toTaskFilterInput(query);
    const page: ListListTasksOutput = await answerRefusals(() =>
      this.listListTasks.execute({
        ...caller,
        listId: path.listId.toLowerCase(),
        filter,
        order: toTaskOrder(query.sort),
        after: toTaskPosition(query.cursor, path.listId, filter, query.sort),
        limit: query.limit,
      }),
    );
    return toTaskSummaryPage(page, toTaskCursor(page.next, path.listId, filter, query.sort));
  }

  /** Reads the same task collection using JSON filters. */
  @QueryMethod(':listId/tasks')
  @UseGuards(RequiredDuplicateBodyGuard)
  public async queryList(
    @Param() path: ListTasksPath,
    @Body() body: QueryListTasksBody,
  ): Promise<TaskSummaryPageBody> {
    return this.list(path, body);
  }

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
   * @param {CreateTaskPath} path - The id of the list.
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
    @Param() path: CreateTaskPath,
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
