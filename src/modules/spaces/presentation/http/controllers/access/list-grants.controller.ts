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
} from '@nestjs/common';
import type { Response } from 'express';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { RemoveListGrantOutput } from '../../../../application/use-cases/commands/access/remove-list-grant/remove-list-grant.output.js';
import { RemoveListGrant } from '../../../../application/use-cases/commands/access/remove-list-grant/remove-list-grant.use-case.js';
import type { SetListGrantOutput } from '../../../../application/use-cases/commands/access/set-list-grant/set-list-grant.output.js';
import { SetListGrant } from '../../../../application/use-cases/commands/access/set-list-grant/set-list-grant.use-case.js';
import type { ListListGrantsOutput } from '../../../../application/use-cases/queries/access/list-list-grants/list-list-grants.output.js';
import { ListListGrants } from '../../../../application/use-cases/queries/access/list-list-grants/list-list-grants.use-case.js';
import { ListGrantBody } from '../../dto/input/access/list-grant-body.dto.js';
import { ListGrantPath } from '../../dto/input/access/list-grant-path.dto.js';
import { ListGrantsPath } from '../../dto/input/access/list-grants-path.dto.js';
import { ListGrantsQuery } from '../../dto/input/access/list-grants-query.dto.js';
import { answerRefusals } from '../../errors/space/space-refusal.problem.js';
import { toGrantsPosition } from '../../mappers/access/grant-cursor.mapper.js';
import { toGrantPage } from '../../mappers/access/grant-page.mapper.js';
import { toGrant } from '../../mappers/access/grant.mapper.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';

/**
 * Class ListGrantsController
 *
 * @description
 * The grants of a list of `openapi/internal/task-service.yaml`, which the gateway calls for
 * `GET /v1/lists/{listId}/grants` and `PUT` and `DELETE /v1/lists/{listId}/grants/{userId}`.
 * They accept the issuer `api-gateway` only, with the actor `user` and an organization, which come
 * from the verified internal token, never from the request; the `userId` of the path is the
 * person given access, lower-cased. A change answers the version of the list after it as `ETag`.
 * The controller validates, maps and delegates: who reads and who changes the grants, and the
 * transaction, belong to the use cases.
 */
@Controller('internal/v1/lists/:listId/grants')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class ListGrantsController {
  // #region Properties
  /**
   * Property listListGrants
   *
   * @description
   * Use case of the listing.
   *
   * @type {ListListGrants}
   * @readonly
   */
  private readonly listListGrants: ListListGrants;

  /**
   * Property setListGrant
   *
   * @description
   * Use case of a grant given or changed.
   *
   * @type {SetListGrant}
   * @readonly
   */
  private readonly setListGrant: SetListGrant;

  /**
   * Property removeListGrant
   *
   * @description
   * Use case of a grant removed.
   *
   * @type {RemoveListGrant}
   * @readonly
   */
  private readonly removeListGrant: RemoveListGrant;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `SpacesModule`.
   *
   * @param {ListListGrants} listListGrants - Use case of the listing.
   * @param {SetListGrant} setListGrant - Use case of a grant given or changed.
   * @param {RemoveListGrant} removeListGrant - Use case of a grant removed.
   * @constructor
   */
  public constructor(
    listListGrants: ListListGrants,
    setListGrant: SetListGrant,
    removeListGrant: RemoveListGrant,
  ) {
    this.listListGrants = listListGrants;
    this.setListGrant = setListGrant;
    this.removeListGrant = removeListGrant;
  }
  // #endregion

  // #region Methods
  /**
   * Method list
   *
   * @description
   * `GET /internal/v1/lists/{listId}/grants`: `200` with one page of the grants of a list the
   * actor has a role on, in the order they were first given, and their `total`;
   * `404 list.not-found` for any other list.
   *
   * @param {ListGrantsPath} path - The id of the list.
   * @param {ListGrantsQuery} query - The cursor and the page size.
   * @returns {Promise<GrantPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this list,
   * or `404 list.not-found`.
   */
  @Get()
  public async list(
    @Param() path: ListGrantsPath,
    @Query() query: ListGrantsQuery,
  ): Promise<GrantPageBody> {
    const caller: Caller = toCaller();
    const page: ListListGrantsOutput = await answerRefusals(() =>
      this.listListGrants.execute({
        ...caller,
        listId: path.listId,
        after: toGrantsPosition(query.cursor, 'list-grants', path.listId),
        limit: query.limit,
      }),
    );
    return toGrantPage(page, 'list-grants', path.listId);
  }

  /**
   * Method set
   *
   * @description
   * `PUT /internal/v1/lists/{listId}/grants/{userId}`: `200` with the grant and `ETag`, the
   * version of the list after the change (the same one when the person already held the role).
   * `404 list.not-found`, `403 access.role-insufficient`, `412 request.version-mismatch`,
   * `422 access.grantee-invalid`, `422 access.owner-unchangeable` and
   * `422 access.grant-limit-reached` come from the use case.
   *
   * @param {ListGrantPath} path - The list and the person.
   * @param {ListGrantBody} body - The role.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @param {Response} response - The response, for `ETag`.
   * @returns {Promise<Grant>} The grant.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Put(':userId')
  public async set(
    @Param() path: ListGrantPath,
    @Body() body: ListGrantBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Grant> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const set: SetListGrantOutput = await answerRefusals(() =>
      this.setListGrant.execute({
        ...caller,
        listId: path.listId,
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
   * `DELETE /internal/v1/lists/{listId}/grants/{userId}`: `204` with `ETag`, the version of the
   * list after the change (the same one when the person held no grant). `404 list.not-found`,
   * `403 access.role-insufficient`, `412 request.version-mismatch` and
   * `422 access.owner-unchangeable` come from the use case.
   *
   * @param {ListGrantPath} path - The list and the person.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @param {Response} response - The response, for `ETag`.
   * @returns {Promise<void>} Resolves once removed.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Delete(':userId')
  @HttpCode(204)
  public async remove(
    @Param() path: ListGrantPath,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const removed: RemoveListGrantOutput = await answerRefusals(() =>
      this.removeListGrant.execute({
        ...caller,
        listId: path.listId,
        userId: path.userId.toLowerCase(),
        expectedVersions,
      }),
    );
    response.setHeader('ETag', formatEtag(removed.version));
  }
  // #endregion
}
