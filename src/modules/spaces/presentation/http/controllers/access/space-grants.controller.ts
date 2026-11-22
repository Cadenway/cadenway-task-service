import type {
  Grant,
  GrantPage as GrantPageBody,
} from '@cadenway/contracts/types/internal/task-service';
import { formatEtag, InternalAccess } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { RemoveSpaceGrantOutput } from '../../../../application/use-cases/commands/access/remove-space-grant/remove-space-grant.output.js';
import { RemoveSpaceGrant } from '../../../../application/use-cases/commands/access/remove-space-grant/remove-space-grant.use-case.js';
import type { SetSpaceGrantOutput } from '../../../../application/use-cases/commands/access/set-space-grant/set-space-grant.output.js';
import { SetSpaceGrant } from '../../../../application/use-cases/commands/access/set-space-grant/set-space-grant.use-case.js';
import type { ListSpaceGrantsOutput } from '../../../../application/use-cases/queries/access/list-space-grants/list-space-grants.output.js';
import { ListSpaceGrants } from '../../../../application/use-cases/queries/access/list-space-grants/list-space-grants.use-case.js';
import { SpaceGrantBody } from '../../dto/input/access/space-grant-body.dto.js';
import { SpaceGrantPath } from '../../dto/input/access/space-grant-path.dto.js';
import { SpaceGrantsPath } from '../../dto/input/access/space-grants-path.dto.js';
import { SpaceGrantsQuery } from '../../dto/input/access/space-grants-query.dto.js';
import { answerRefusals } from '../../errors/space/space-refusal.problem.js';
import { CurrentMembershipGuard } from '../../guards/space/current-membership.guard.js';
import { toGrantsPosition } from '../../mappers/access/grant-cursor.mapper.js';
import { toGrantPage } from '../../mappers/access/grant-page.mapper.js';
import { toGrant } from '../../mappers/access/grant.mapper.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';

/**
 * Class SpaceGrantsController
 *
 * @description
 * The grants of a space of `openapi/internal/task-service.yaml`, which the gateway calls for
 * `GET /v1/spaces/{spaceId}/grants` and `PUT` and `DELETE /v1/spaces/{spaceId}/grants/{userId}`.
 * They accept the issuer `api-gateway` only, with the actor `user` and an organization, which come
 * from the verified internal token, never from the request; the `userId` of the path is the
 * person given access, lower-cased. A change answers the version of the space after it as `ETag`.
 * The controller validates, maps and delegates: who reads and who changes the grants, and the
 * transaction, belong to the use cases.
 */
@Controller('internal/v1/spaces/:spaceId/grants')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
@UseGuards(CurrentMembershipGuard)
export class SpaceGrantsController {
  // #region Properties
  /**
   * Property listSpaceGrants
   *
   * @description
   * Use case of the listing.
   *
   * @type {ListSpaceGrants}
   * @readonly
   */
  private readonly listSpaceGrants: ListSpaceGrants;

  /**
   * Property setSpaceGrant
   *
   * @description
   * Use case of a grant given or changed.
   *
   * @type {SetSpaceGrant}
   * @readonly
   */
  private readonly setSpaceGrant: SetSpaceGrant;

  /**
   * Property removeSpaceGrant
   *
   * @description
   * Use case of a grant removed.
   *
   * @type {RemoveSpaceGrant}
   * @readonly
   */
  private readonly removeSpaceGrant: RemoveSpaceGrant;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `SpacesModule`.
   *
   * @param {ListSpaceGrants} listSpaceGrants - Use case of the listing.
   * @param {SetSpaceGrant} setSpaceGrant - Use case of a grant given or changed.
   * @param {RemoveSpaceGrant} removeSpaceGrant - Use case of a grant removed.
   * @constructor
   */
  public constructor(
    listSpaceGrants: ListSpaceGrants,
    setSpaceGrant: SetSpaceGrant,
    removeSpaceGrant: RemoveSpaceGrant,
  ) {
    this.listSpaceGrants = listSpaceGrants;
    this.setSpaceGrant = setSpaceGrant;
    this.removeSpaceGrant = removeSpaceGrant;
  }
  // #endregion

  // #region Methods
  /**
   * Method list
   *
   * @description
   * `GET /internal/v1/spaces/{spaceId}/grants`: `200` with one page of the grants of a space the
   * actor sees, in the order they were first given, and their `total`; `404 space.not-found` for
   * any other space.
   *
   * @param {SpaceGrantsPath} path - The id of the space.
   * @param {SpaceGrantsQuery} query - The cursor and the page size.
   * @returns {Promise<GrantPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this space,
   * or `404 space.not-found`.
   */
  @Get()
  public async list(
    @Param() path: SpaceGrantsPath,
    @Query() query: SpaceGrantsQuery,
  ): Promise<GrantPageBody> {
    const caller: Caller = toCaller();
    const page: ListSpaceGrantsOutput = await answerRefusals(() =>
      this.listSpaceGrants.execute({
        ...caller,
        spaceId: path.spaceId,
        after: toGrantsPosition(query.cursor, 'space-grants', path.spaceId),
        limit: query.limit,
      }),
    );
    return toGrantPage(page, 'space-grants', path.spaceId);
  }

  /**
   * Method set
   *
   * @description
   * `PUT /internal/v1/spaces/{spaceId}/grants/{userId}`: `200` with the grant and `ETag`, the
   * version of the space after the change (the same one when the person already held the role).
   * `404 space.not-found`, `403 space.manage-forbidden`, `412 request.version-mismatch`,
   * `422 access.grantee-invalid`, `422 access.guest-space-forbidden`,
   * `422 access.owner-unchangeable` and `422 access.grant-limit-reached` come from the use case.
   *
   * @param {SpaceGrantPath} path - The space and the person.
   * @param {SpaceGrantBody} body - The role.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @param {Response} response - The response, for `ETag`.
   * @returns {Promise<Grant>} The grant.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Put(':userId')
  public async set(
    @Param() path: SpaceGrantPath,
    @Body() body: SpaceGrantBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Grant> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const set: SetSpaceGrantOutput = await answerRefusals(() =>
      this.setSpaceGrant.execute({
        ...caller,
        spaceId: path.spaceId,
        userId: path.userId.toLowerCase(),
        role: body.role,
        expectedVersions,
      }),
    );
    response.setHeader('ETag', formatEtag(set.version));
    return toGrant(set.grant);
  }

  /**
   * Method remove
   *
   * @description
   * `DELETE /internal/v1/spaces/{spaceId}/grants/{userId}`: `204` with `ETag`, the version of the
   * space after the change (the same one when the person held no grant). `404 space.not-found`,
   * `403 space.manage-forbidden`, `412 request.version-mismatch` and
   * `422 access.owner-unchangeable` come from the use case.
   *
   * @param {SpaceGrantPath} path - The space and the person.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @param {Response} response - The response, for `ETag`.
   * @returns {Promise<void>} Resolves once removed.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Delete(':userId')
  @HttpCode(204)
  public async remove(
    @Param() path: SpaceGrantPath,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const removed: RemoveSpaceGrantOutput = await answerRefusals(() =>
      this.removeSpaceGrant.execute({
        ...caller,
        spaceId: path.spaceId,
        userId: path.userId.toLowerCase(),
        expectedVersions,
      }),
    );
    response.setHeader('ETag', formatEtag(removed.version));
  }
  // #endregion
}
