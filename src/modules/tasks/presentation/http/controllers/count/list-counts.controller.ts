import type { ListSummary } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Param, Query } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { GetListCountsOutput } from '../../../../application/use-cases/queries/list/get-list-counts/get-list-counts.output.js';
import { GetListCounts } from '../../../../application/use-cases/queries/list/get-list-counts/get-list-counts.use-case.js';
import { ListCountsPath } from '../../dto/input/count/list-counts-path.dto.js';
import { ListCountsQuery } from '../../dto/input/count/list-counts-query.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toListSummary } from '../../mappers/count/list-summary.mapper.js';

/**
 * Class ListCountsController
 *
 * @description
 * The list and its counters, `GET /internal/v1/lists/{listId}/counts` of
 * `openapi/internal/task-service.yaml`. It accepts the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal token,
 * never from the request. The controller validates, maps and delegates: the visibility of the list
 * and the counting belong to the use case. The answer carries no `ETag`: the contract declares
 * none.
 */
@Controller('internal/v1/lists')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class ListCountsController {
  // #region Properties
  /**
   * Property getListCounts
   *
   * @description
   * Use case of the reading.
   *
   * @type {GetListCounts}
   * @readonly
   */
  private readonly getListCounts: GetListCounts;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use case, provided by `TasksModule`.
   *
   * @param {GetListCounts} getListCounts - Use case of the reading.
   * @constructor
   */
  public constructor(getListCounts: GetListCounts) {
    this.getListCounts = getListCounts;
  }
  // #endregion

  // #region Methods
  /**
   * Method get
   *
   * @description
   * `GET /internal/v1/lists/{listId}/counts`: `200` with the list and the counters of its
   * top-level tasks (all, open, done, cancelled and late against the `today` of the query).
   *
   * @param {ListCountsPath} path - The id of the list.
   * @param {ListCountsQuery} query - The date of the caller.
   * @returns {Promise<ListSummary>} The list and its counters.
   * @throws {ProblemException} `404 list.not-found` or `404 organization.not-found`.
   */
  @Get(':listId/counts')
  public async get(
    @Param() path: ListCountsPath,
    @Query() query: ListCountsQuery,
  ): Promise<ListSummary> {
    const caller: Caller = toCaller();
    const summary: GetListCountsOutput = await answerRefusals(() =>
      this.getListCounts.execute({
        ...caller,
        listId: path.listId.toLowerCase(),
        today: query.today,
      }),
    );
    return toListSummary(summary);
  }
  // #endregion
}
