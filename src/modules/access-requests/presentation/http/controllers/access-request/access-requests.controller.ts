import type {
  AccessRequest as AccessRequestBody,
  AccessRequestPage as AccessRequestPageBody,
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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { PagePosition } from '../../../../application/models/page/page-position.model.js';
import type { ApproveAccessRequestOutput } from '../../../../application/use-cases/commands/access-request/approve-access-request/approve-access-request.output.js';
import { ApproveAccessRequest } from '../../../../application/use-cases/commands/access-request/approve-access-request/approve-access-request.use-case.js';
import { CreateAccessRequest } from '../../../../application/use-cases/commands/access-request/create-access-request/create-access-request.use-case.js';
import type { RefuseAccessRequestOutput } from '../../../../application/use-cases/commands/access-request/refuse-access-request/refuse-access-request.output.js';
import { RefuseAccessRequest } from '../../../../application/use-cases/commands/access-request/refuse-access-request/refuse-access-request.use-case.js';
import type { ListAccessRequestsOutput } from '../../../../application/use-cases/queries/access-request/list-access-requests/list-access-requests.output.js';
import { ListAccessRequests } from '../../../../application/use-cases/queries/access-request/list-access-requests/list-access-requests.use-case.js';
import { AccessRequestPath } from '../../dto/input/access-request/access-request-path.dto.js';
import { ApproveAccessRequestBody } from '../../dto/input/access-request/approve-access-request-body.dto.js';
import { CreateAccessRequestBody } from '../../dto/input/access-request/create-access-request-body.dto.js';
import { ListAccessRequestsQuery } from '../../dto/input/access-request/list-access-requests-query.dto.js';
import { RefuseAccessRequestBody } from '../../dto/input/access-request/refuse-access-request-body.dto.js';
import { answerRefusals } from '../../errors/access-request/access-request-refusal.problem.js';
import { CurrentMembershipGuard } from '../../guards/access-request/current-membership.guard.js';
import { toAccessRequestsPosition } from '../../mappers/access-request/access-request-cursor.mapper.js';
import { toAccessRequestPage } from '../../mappers/access-request/access-request-page.mapper.js';
import { toAccessRequest } from '../../mappers/access-request/access-request.mapper.js';
import { toRequestedTarget } from '../../mappers/access-request/requested-target.mapper.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/**
 * Class AccessRequestsController
 *
 * @description
 * The access requests of `openapi/internal/task-service.yaml`, which the gateway calls for
 * `/v1/access-requests`. They accept the issuer `api-gateway` only, with the actor `user` and an
 * organization. The actor and the organization come from the verified internal token, never from
 * the request. The controller validates, maps and delegates: the rules, the limit and the
 * transaction belong to the use cases.
 */
@Controller('internal/v1/access-requests')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class AccessRequestsController {
  // #region Properties
  /**
   * Property createAccessRequest
   *
   * @description
   * Use case of a request.
   *
   * @type {CreateAccessRequest}
   * @readonly
   */
  private readonly createAccessRequest: CreateAccessRequest;

  /**
   * Property listAccessRequests
   *
   * @description
   * Use case of the listing.
   *
   * @type {ListAccessRequests}
   * @readonly
   */
  private readonly listAccessRequests: ListAccessRequests;

  /**
   * Property approveAccessRequest
   *
   * @description
   * Use case of an approval.
   *
   * @type {ApproveAccessRequest}
   * @readonly
   */
  private readonly approveAccessRequest: ApproveAccessRequest;

  /**
   * Property refuseAccessRequest
   *
   * @description
   * Use case of a refusal.
   *
   * @type {RefuseAccessRequest}
   * @readonly
   */
  private readonly refuseAccessRequest: RefuseAccessRequest;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `AccessRequestsModule`.
   *
   * @param {CreateAccessRequest} createAccessRequest - Use case of a request.
   * @param {ListAccessRequests} listAccessRequests - Use case of the listing.
   * @param {ApproveAccessRequest} approveAccessRequest - Use case of an approval.
   * @param {RefuseAccessRequest} refuseAccessRequest - Use case of a refusal.
   * @constructor
   */
  public constructor(
    createAccessRequest: CreateAccessRequest,
    listAccessRequests: ListAccessRequests,
    approveAccessRequest: ApproveAccessRequest,
    refuseAccessRequest: RefuseAccessRequest,
  ) {
    this.createAccessRequest = createAccessRequest;
    this.listAccessRequests = listAccessRequests;
    this.approveAccessRequest = approveAccessRequest;
    this.refuseAccessRequest = refuseAccessRequest;
  }
  // #endregion

  // #region Methods
  /**
   * Method create
   *
   * @description
   * `POST /internal/v1/access-requests`: `202` with no body, whether the request was stored or
   * not. `404 organization.not-found` for an actor the copy does not hold;
   * `429 access-request.limit-reached` with `details.nextAvailableAt` and `Retry-After` beyond 10
   * requests within the hour.
   *
   * @param {CreateAccessRequestBody} body - The target and the message.
   * @param {Response} response - The response, for `Retry-After`.
   * @returns {Promise<void>} Nothing: the answer has no body.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a body that does
   * not name exactly one target.
   */
  @Post()
  @HttpCode(202)
  public async create(
    @Body() body: CreateAccessRequestBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const caller: Caller = toCaller();
    await answerRefusals(
      () =>
        this.createAccessRequest.execute({
          ...caller,
          target: toRequestedTarget(body),
          message: body.message ?? null,
        }),
      response,
    );
  }

  /**
   * Method list
   *
   * @description
   * `GET /internal/v1/access-requests`: `200` with a page of the pending requests the actor
   * answers, the most recent first, and the total on every page. `404 organization.not-found` for
   * an actor the copy does not hold.
   *
   * @param {ListAccessRequestsQuery} query - The filters, the cursor and the page size.
   * @returns {Promise<AccessRequestPageBody>} The page.
   * @throws {ProblemException} The refusal above, or `400 request.invalid` for a cursor that is not
   * one of this collection.
   */
  @Get()
  @UseGuards(CurrentMembershipGuard)
  public async list(@Query() query: ListAccessRequestsQuery): Promise<AccessRequestPageBody> {
    const caller: Caller = toCaller();
    const spaceId: string | null = query.spaceId === undefined ? null : query.spaceId.toLowerCase();
    const listId: string | null = query.listId === undefined ? null : query.listId.toLowerCase();
    const after: PagePosition | null = toAccessRequestsPosition(query.cursor, spaceId, listId);
    const page: ListAccessRequestsOutput = await answerRefusals(() =>
      this.listAccessRequests.execute({ ...caller, spaceId, listId, after, limit: query.limit }),
    );
    return toAccessRequestPage(page, spaceId, listId);
  }

  /**
   * Method approve
   *
   * @description
   * `POST /internal/v1/access-requests/{accessRequestId}/approval`: `200` with the request,
   * approved. `404 access-request.not-found`, `409 access-request.already-decided` with
   * `details.state`, and the `422` of the grants come from the use case.
   *
   * @param {AccessRequestPath} path - The id of the request.
   * @param {ApproveAccessRequestBody} body - The role.
   * @returns {Promise<AccessRequestBody>} The request, approved.
   * @throws {ProblemException} The refusals above.
   */
  @Post(':accessRequestId/approval')
  @UseGuards(CurrentMembershipGuard)
  @HttpCode(200)
  public async approve(
    @Param() path: AccessRequestPath,
    @Body() body: ApproveAccessRequestBody,
  ): Promise<AccessRequestBody> {
    const caller: Caller = toCaller();
    const view: ApproveAccessRequestOutput = await answerRefusals(() =>
      this.approveAccessRequest.execute({
        ...caller,
        accessRequestId: path.accessRequestId.toLowerCase(),
        role: body.role,
      }),
    );
    return toAccessRequest(view);
  }

  /**
   * Method refuse
   *
   * @description
   * `POST /internal/v1/access-requests/{accessRequestId}/refusal`: `200` with the request,
   * refused. `404 access-request.not-found` and `409 access-request.already-decided` with
   * `details.state` come from the use case.
   *
   * @param {RefuseAccessRequestBody} _body - The empty object of the contract, validated, not read.
   * @param {AccessRequestPath} path - The id of the request.
   * @returns {Promise<AccessRequestBody>} The request, refused.
   * @throws {ProblemException} The refusals above.
   */
  @Post(':accessRequestId/refusal')
  @UseGuards(CurrentMembershipGuard)
  @HttpCode(200)
  public async refuse(
    @Body() _body: RefuseAccessRequestBody,
    @Param() path: AccessRequestPath,
  ): Promise<AccessRequestBody> {
    const caller: Caller = toCaller();
    const view: RefuseAccessRequestOutput = await answerRefusals(() =>
      this.refuseAccessRequest.execute({
        ...caller,
        accessRequestId: path.accessRequestId.toLowerCase(),
      }),
    );
    return toAccessRequest(view);
  }
  // #endregion
}
