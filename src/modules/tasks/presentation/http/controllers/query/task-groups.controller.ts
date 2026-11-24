import type { TaskGroupPage as TaskGroupPageBody } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Body, Controller, Get, Param, Query, QueryMethod, UseGuards } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { TaskFilterInput } from '../../../../application/models/query/task-filter-input.model.js';
import type { CountListTaskGroupsOutput } from '../../../../application/use-cases/queries/list/count-list-task-groups/count-list-task-groups.output.js';
import { CountListTaskGroups } from '../../../../application/use-cases/queries/list/count-list-task-groups/count-list-task-groups.use-case.js';
import { TaskGroupsPath } from '../../dto/input/query/task-groups-path.dto.js';
import { QueryTaskGroupsBody } from '../../dto/input/query/query-task-groups-body.dto.js';
import { TaskGroupsQuery } from '../../dto/input/query/task-groups-query.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { RequiredDuplicateBodyGuard } from '../../guards/duplicate/required-duplicate-body.guard.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import {
  toTaskGroupCursor,
  toTaskGroupPosition,
} from '../../mappers/query/task-group-cursor.mapper.js';
import { toTaskGroupPage } from '../../mappers/query/task-group-page.mapper.js';
import { toTaskFilterInput } from '../../mappers/query/task-filter.mapper.js';

/**
 * Class TaskGroupsController
 *
 * @description
 * The count of the tasks of a list by status, priority or assignee,
 * `GET /internal/v1/lists/{listId}/task-groups` of `openapi/internal/task-service.yaml`. It accepts
 * the issuer `api-gateway` only, with the actor `user` and an organization. The actor and the
 * organization come from the verified internal token, never from the request. The controller
 * validates, maps and delegates: the visibility of the list, the filters, the order and the zero
 * groups belong to the use case. The answer carries no `ETag`: the contract declares none.
 */
@Controller('internal/v1/lists')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskGroupsController {
  // #region Properties
  /**
   * Property countListTaskGroups
   *
   * @description
   * Use case of the reading.
   *
   * @type {CountListTaskGroups}
   * @readonly
   */
  private readonly countListTaskGroups: CountListTaskGroups;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use case, provided by `TasksModule`.
   *
   * @param {CountListTaskGroups} countListTaskGroups - Use case of the reading.
   * @constructor
   */
  public constructor(countListTaskGroups: CountListTaskGroups) {
    this.countListTaskGroups = countListTaskGroups;
  }
  // #endregion

  // #region Methods
  /**
   * Method count
   *
   * @description
   * `GET /internal/v1/lists/{listId}/task-groups`: `200` with one page of the groups of the tasks
   * of the list the actor sees, kept to the filters of the query (the same as the tasks of the
   * list, without the sort), and the number of tasks that match them, each counted once.
   *
   * @param {TaskGroupsPath} path - The id of the list.
   * @param {TaskGroupsQuery} query - What to group by, the filters, the cursor and the page size.
   * @returns {Promise<TaskGroupPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
   * collection, `404 list.not-found` or `404 organization.not-found`.
   */
  @Get(':listId/task-groups')
  public async count(
    @Param() path: TaskGroupsPath,
    @Query() query: TaskGroupsQuery,
  ): Promise<TaskGroupPageBody> {
    const caller: Caller = toCaller();
    const filter: TaskFilterInput = toTaskFilterInput(query);
    const page: CountListTaskGroupsOutput = await answerRefusals(() =>
      this.countListTaskGroups.execute({
        ...caller,
        listId: path.listId.toLowerCase(),
        grouping: query.groupBy,
        filter,
        after: toTaskGroupPosition(query.cursor, path.listId, query.groupBy, filter),
        limit: query.limit,
      }),
    );
    return toTaskGroupPage(page, toTaskGroupCursor(page.next, path.listId, query.groupBy, filter));
  }

  /** Counts the same task groups using JSON filters. */
  @QueryMethod(':listId/task-groups')
  @UseGuards(RequiredDuplicateBodyGuard)
  public async queryCount(
    @Param() path: TaskGroupsPath,
    @Body() body: QueryTaskGroupsBody,
  ): Promise<TaskGroupPageBody> {
    return this.count(path, body);
  }
  // #endregion
}
