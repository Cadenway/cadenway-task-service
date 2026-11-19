import type {
  TaskList,
  TaskListPage as TaskListPageBody,
} from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { CreateListOutput } from '../../../../application/use-cases/commands/list/create-list/create-list.output.js';
import { CreateList } from '../../../../application/use-cases/commands/list/create-list/create-list.use-case.js';
import type { ListListsOutput } from '../../../../application/use-cases/queries/list/list-lists/list-lists.output.js';
import { ListLists } from '../../../../application/use-cases/queries/list/list-lists/list-lists.use-case.js';
import { CreateListBody } from '../../dto/input/list/create-list-body.dto.js';
import { ListListsQuery } from '../../dto/input/list/list-lists-query.dto.js';
import { SpaceListsPath } from '../../dto/input/list/space-lists-path.dto.js';
import { answerRefusals } from '../../errors/space/space-refusal.problem.js';
import type { Caller } from '../../../../application/models/caller/caller.model.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toListsPosition } from '../../mappers/list/list-cursor.mapper.js';
import { toTaskListPage } from '../../mappers/list/task-list-page.mapper.js';
import { toTaskList } from '../../mappers/list/task-list.mapper.js';

/**
 * Class SpaceListsController
 *
 * @description
 * The lists of a space of `openapi/internal/task-service.yaml`, which the gateway calls for `POST`
 * and `GET /v1/spaces/{spaceId}/lists`. They accept the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal
 * token, never from the request. The `ETag` of the creation is set by the `EtagInterceptor` of the
 * kit from the `version` of the body. The controller validates, maps and delegates: the visibility
 * of the space and the transaction belong to the use cases.
 */
@Controller('internal/v1/spaces/:spaceId/lists')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class SpaceListsController {
  // #region Properties
  /**
   * Property createList
   *
   * @description
   * Use case of the creation.
   *
   * @type {CreateList}
   * @readonly
   */
  private readonly createList: CreateList;

  /**
   * Property listLists
   *
   * @description
   * Use case of the list.
   *
   * @type {ListLists}
   * @readonly
   */
  private readonly listLists: ListLists;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `SpacesModule`.
   *
   * @param {CreateList} createList - Use case of the creation.
   * @param {ListLists} listLists - Use case of the list.
   * @constructor
   */
  public constructor(createList: CreateList, listLists: ListLists) {
    this.createList = createList;
    this.listLists = listLists;
  }
  // #endregion

  // #region Methods
  /**
   * Method create
   *
   * @description
   * `POST /internal/v1/spaces/{spaceId}/lists`: `201` with the list or the sprint, `Location` and
   * `ETag`. With an `Idempotency-Key` the kit records the answer for 24 hours and replays it.
   * `404 space.not-found` for a space the actor does not see, `403 access.role-insufficient`
   * without `edit` on it, `422 list.sprint-dates-invalid` for an end before the start. The switch
   * "Accès de l’organisation" is on unless the body turns it off.
   *
   * @param {SpaceListsPath} path - The id of the space.
   * @param {CreateListBody} body - The list, with the defaults of the contract applied.
   * @param {Response} response - The response, for `Location`.
   * @returns {Promise<TaskList>} The list.
   * @throws {ProblemException} `404 space.not-found`, `403 access.role-insufficient` or
   * `422 list.sprint-dates-invalid`.
   */
  @Post()
  @HttpCode(201)
  public async create(
    @Param() path: SpaceListsPath,
    @Body() body: CreateListBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TaskList> {
    const caller: Caller = toCaller();
    const created: CreateListOutput = await answerRefusals(() =>
      this.createList.execute({
        ...caller,
        spaceId: path.spaceId,
        name: body.name,
        icon: body.icon,
        color: body.color,
        sprint:
          body.sprint === undefined || body.sprint === null
            ? null
            : {
                startDate: body.sprint.startDate,
                endDate: body.sprint.endDate,
                goal: body.sprint.goal ?? null,
              },
        organizationAccess: body.organizationAccess ?? true,
      }),
    );
    response.setHeader('Location', `/internal/v1/lists/${created.list.id}`);
    return toTaskList(created);
  }

  /**
   * Method list
   *
   * @description
   * `GET /internal/v1/spaces/{spaceId}/lists`: `200` with one page of the lists of a space the
   * actor sees that they have a role on, in the order of their creation; `404 space.not-found` for
   * any other space.
   *
   * @param {SpaceListsPath} path - The id of the space.
   * @param {ListListsQuery} query - The cursor and the page size.
   * @returns {Promise<TaskListPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this space,
   * or `404 space.not-found`.
   */
  @Get()
  public async list(
    @Param() path: SpaceListsPath,
    @Query() query: ListListsQuery,
  ): Promise<TaskListPageBody> {
    const caller: Caller = toCaller();
    const page: ListListsOutput = await answerRefusals(() =>
      this.listLists.execute({
        ...caller,
        spaceId: path.spaceId,
        after: toListsPosition(query.cursor, path.spaceId),
        limit: query.limit,
      }),
    );
    return toTaskListPage(page, path.spaceId);
  }
  // #endregion
}
