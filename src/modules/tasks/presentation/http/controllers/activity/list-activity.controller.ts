import type { ActivityPage as ActivityPageBody } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Param, Query } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { ListListActivityOutput } from '../../../../application/use-cases/queries/activity/list-list-activity/list-list-activity.output.js';
import { ListListActivity } from '../../../../application/use-cases/queries/activity/list-list-activity/list-list-activity.use-case.js';
import { ListActivityPath } from '../../dto/input/activity/list-activity-path.dto.js';
import { ListActivityQuery } from '../../dto/input/activity/list-activity-query.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toActivityPage } from '../../mappers/activity/activity-page.mapper.js';
import {
  toListActivityCursor,
  toListActivityPosition,
} from '../../mappers/activity/activity-cursor.mapper.js';
import { toActorIds, toKinds } from '../../mappers/activity/activity-filter.mapper.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/**
 * Class ListActivityController
 *
 * @description
 * The activity log of a list, `GET /internal/v1/lists/{listId}/activity` of
 * `openapi/internal/task-service.yaml`. It accepts the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal
 * token, never from the request. The controller validates, maps and delegates: the visibility of
 * the list and of the task of each entry belongs to the use case.
 */
@Controller('internal/v1/lists')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class ListActivityController {
  // #region Properties
  /**
   * Property listListActivity
   *
   * @description
   * Use case of the reading.
   *
   * @type {ListListActivity}
   * @readonly
   */
  private readonly listListActivity: ListListActivity;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use case, provided by `TasksModule`.
   *
   * @param {ListListActivity} listListActivity - Use case of the reading.
   * @constructor
   */
  public constructor(listListActivity: ListListActivity) {
    this.listListActivity = listListActivity;
  }
  // #endregion

  // #region Methods
  /**
   * Method list
   *
   * @description
   * `GET /internal/v1/lists/{listId}/activity`: `200` with one page of the entries recorded while
   * their task was in the list, the most recent first, kept to the `kind` and `actorId` of the
   * query (`?kind=status,assign`); the entries of a task the actor no longer sees are left out of
   * `items` and `total`.
   *
   * @param {ListActivityPath} path - The id of the list.
   * @param {ListActivityQuery} query - The filters, the cursor and the page size.
   * @returns {Promise<ActivityPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
   * collection, `404 list.not-found` or `404 organization.not-found`.
   */
  @Get(':listId/activity')
  public async list(
    @Param() path: ListActivityPath,
    @Query() query: ListActivityQuery,
  ): Promise<ActivityPageBody> {
    const caller: Caller = toCaller();
    const kinds: ReturnType<typeof toKinds> = toKinds(query.kind);
    const actorIds: ReturnType<typeof toActorIds> = toActorIds(query.actorId);
    const page: ListListActivityOutput = await answerRefusals(() =>
      this.listListActivity.execute({
        ...caller,
        listId: path.listId.toLowerCase(),
        kinds,
        actorIds,
        after: toListActivityPosition(query.cursor, path.listId, kinds, actorIds),
        limit: query.limit,
      }),
    );
    return toActivityPage(page, toListActivityCursor(page.next, path.listId, kinds, actorIds));
  }
  // #endregion
}
