import type { LabelPage as LabelPageBody } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Query } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { ListLabelsOutput } from '../../../../application/use-cases/queries/label/list-labels/list-labels.output.js';
import { ListLabels } from '../../../../application/use-cases/queries/label/list-labels/list-labels.use-case.js';
import { LabelsQuery } from '../../dto/input/label/labels-query.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toLabelCursor, toLabelPosition } from '../../mappers/label/label-cursor.mapper.js';
import { toLabelPage } from '../../mappers/label/label-page.mapper.js';

/**
 * Class LabelsController
 *
 * @description
 * The labels of the tasks the actor sees, `GET /internal/v1/labels` of
 * `openapi/internal/task-service.yaml`. It accepts the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal token,
 * never from the request. The controller validates, maps and delegates: which tasks the actor sees
 * and the spelling of each label belong to the use case. The answer carries no `ETag`: the contract
 * declares none.
 */
@Controller('internal/v1/labels')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class LabelsController {
  // #region Properties
  /**
   * Property listLabels
   *
   * @description
   * Use case of the reading.
   *
   * @type {ListLabels}
   * @readonly
   */
  private readonly listLabels: ListLabels;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use case, provided by `TasksModule`.
   *
   * @param {ListLabels} listLabels - Use case of the reading.
   * @constructor
   */
  public constructor(listLabels: ListLabels) {
    this.listLabels = listLabels;
  }
  // #endregion

  // #region Methods
  /**
   * Method list
   *
   * @description
   * `GET /internal/v1/labels`: `200` with one page of the labels of the tasks the actor sees, each
   * once, kept to those that contain the `search` text without regard to case or accents.
   *
   * @param {LabelsQuery} query - The search text, the cursor and the page size.
   * @returns {Promise<LabelPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
   * collection, or `404 organization.not-found`.
   */
  @Get()
  public async list(@Query() query: LabelsQuery): Promise<LabelPageBody> {
    const caller: Caller = toCaller();
    const page: ListLabelsOutput = await answerRefusals(() =>
      this.listLabels.execute({
        ...caller,
        search: query.search ?? null,
        after: toLabelPosition(query.cursor, query.search),
        limit: query.limit,
      }),
    );
    return toLabelPage(page, toLabelCursor(page.next, query.search));
  }
  // #endregion
}
