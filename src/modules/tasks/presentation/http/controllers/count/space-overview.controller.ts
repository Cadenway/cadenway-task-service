import type { SpaceOverview } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Param, Query } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { GetSpaceOverviewOutput } from '../../../../application/use-cases/queries/space/get-space-overview/get-space-overview.output.js';
import { GetSpaceOverview } from '../../../../application/use-cases/queries/space/get-space-overview/get-space-overview.use-case.js';
import { SpaceOverviewPath } from '../../dto/input/count/space-overview-path.dto.js';
import { SpaceOverviewQuery } from '../../dto/input/count/space-overview-query.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toSpaceOverviewPosition } from '../../mappers/count/space-overview-cursor.mapper.js';
import { toSpaceOverview } from '../../mappers/count/space-overview.mapper.js';

/**
 * Class SpaceOverviewController
 *
 * @description
 * The overview of a space, `GET /internal/v1/spaces/{spaceId}/overview` of
 * `openapi/internal/task-service.yaml`. It accepts the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal token,
 * never from the request. The controller validates, maps and delegates: the visibility of the
 * space and the counting belong to the use case, which reads the lists and their counters in one
 * snapshot. The answer carries no `ETag`: the contract declares none.
 */
@Controller('internal/v1/spaces')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class SpaceOverviewController {
  // #region Properties
  /**
   * Property getSpaceOverview
   *
   * @description
   * Use case of the reading.
   *
   * @type {GetSpaceOverview}
   * @readonly
   */
  private readonly getSpaceOverview: GetSpaceOverview;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use case, provided by `TasksModule`.
   *
   * @param {GetSpaceOverview} getSpaceOverview - Use case of the reading.
   * @constructor
   */
  public constructor(getSpaceOverview: GetSpaceOverview) {
    this.getSpaceOverview = getSpaceOverview;
  }
  // #endregion

  // #region Methods
  /**
   * Method get
   *
   * @description
   * `GET /internal/v1/spaces/{spaceId}/overview`: `200` with the number of lists and of top-level
   * tasks of the space, and one page of its lists in order of creation with their counters.
   *
   * @param {SpaceOverviewPath} path - The id of the space.
   * @param {SpaceOverviewQuery} query - The date of the caller, the cursor and the page size.
   * @returns {Promise<SpaceOverview>} The overview.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this space,
   * `404 space.not-found` or `404 organization.not-found`.
   */
  @Get(':spaceId/overview')
  public async get(
    @Param() path: SpaceOverviewPath,
    @Query() query: SpaceOverviewQuery,
  ): Promise<SpaceOverview> {
    const caller: Caller = toCaller();
    const overview: GetSpaceOverviewOutput = await answerRefusals(() =>
      this.getSpaceOverview.execute({
        ...caller,
        spaceId: path.spaceId.toLowerCase(),
        today: query.today,
        after: toSpaceOverviewPosition(query.cursor, path.spaceId),
        limit: query.limit,
      }),
    );
    return toSpaceOverview(overview);
  }
  // #endregion
}
