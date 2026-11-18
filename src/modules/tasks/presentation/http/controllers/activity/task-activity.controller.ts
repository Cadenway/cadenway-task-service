import type { ActivityPage as ActivityPageBody } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Param, Query } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { ListTaskActivityOutput } from '../../../../application/use-cases/queries/activity/list-task-activity/list-task-activity.output.js';
import { ListTaskActivity } from '../../../../application/use-cases/queries/activity/list-task-activity/list-task-activity.use-case.js';
import { TaskActivityQuery } from '../../dto/input/activity/task-activity-query.dto.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import {
  toTaskActivityCursor,
  toTaskActivityPosition,
} from '../../mappers/activity/activity-cursor.mapper.js';
import { toKinds } from '../../mappers/activity/activity-filter.mapper.js';
import { toActivityPage } from '../../mappers/activity/activity-page.mapper.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/**
 * Class TaskActivityController
 *
 * @description
 * The activity log of a task, `GET /internal/v1/tasks/{taskKey}/activity` of
 * `openapi/internal/task-service.yaml`. It accepts the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal
 * token, never from the request. The controller validates, maps and delegates: the visibility of
 * the task belongs to the use case.
 */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskActivityController {
  // #region Properties
  /**
   * Property listTaskActivity
   *
   * @description
   * Use case of the reading.
   *
   * @type {ListTaskActivity}
   * @readonly
   */
  private readonly listTaskActivity: ListTaskActivity;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use case, provided by `TasksModule`.
   *
   * @param {ListTaskActivity} listTaskActivity - Use case of the reading.
   * @constructor
   */
  public constructor(listTaskActivity: ListTaskActivity) {
    this.listTaskActivity = listTaskActivity;
  }
  // #endregion

  // #region Methods
  /**
   * Method list
   *
   * @description
   * `GET /internal/v1/tasks/{taskKey}/activity`: `200` with one page of the entries of a task the
   * actor sees, the most recent first, kept to the `kind` of the query (`?kind=status,assign`);
   * `total` counts the entries that match.
   *
   * @param {TaskPath} path - The key of the task.
   * @param {TaskActivityQuery} query - The kinds, the cursor and the page size.
   * @returns {Promise<ActivityPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
   * collection, `404 task.not-found` or `404 organization.not-found`.
   */
  @Get(':taskKey/activity')
  public async list(
    @Param() path: TaskPath,
    @Query() query: TaskActivityQuery,
  ): Promise<ActivityPageBody> {
    const caller: Caller = toCaller();
    const kinds: ReturnType<typeof toKinds> = toKinds(query.kind);
    const page: ListTaskActivityOutput = await answerRefusals(() =>
      this.listTaskActivity.execute({
        ...caller,
        taskKey: path.taskKey,
        kinds,
        after: toTaskActivityPosition(query.cursor, path.taskKey, kinds),
        limit: query.limit,
      }),
    );
    return toActivityPage(page, toTaskActivityCursor(page.next, path.taskKey, kinds));
  }
  // #endregion
}
