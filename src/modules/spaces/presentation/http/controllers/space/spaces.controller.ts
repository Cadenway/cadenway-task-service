import type {
  Space,
  SpaceCreated,
  SpacePage as SpacePageBody,
} from '@cadenway/contracts/types/internal/task-service';
import { formatEtag, InternalAccess } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import type { SpaceView } from '../../../../application/projections/space/space-view.projection.js';
import type { CreateSpaceOutput } from '../../../../application/use-cases/commands/space/create-space/create-space.output.js';
import { CreateSpace } from '../../../../application/use-cases/commands/space/create-space/create-space.use-case.js';
import { UpdateSpace } from '../../../../application/use-cases/commands/space/update-space/update-space.use-case.js';
import type { ListSpacesOutput } from '../../../../application/use-cases/queries/space/list-spaces/list-spaces.output.js';
import { GetSpace } from '../../../../application/use-cases/queries/space/get-space/get-space.use-case.js';
import { ListSpaces } from '../../../../application/use-cases/queries/space/list-spaces/list-spaces.use-case.js';
import { CreateSpaceBody } from '../../dto/input/space/create-space-body.dto.js';
import { ListSpacesQuery } from '../../dto/input/space/list-spaces-query.dto.js';
import { SpacePath } from '../../dto/input/space/space-path.dto.js';
import { UpdateSpaceBody } from '../../dto/input/space/update-space-body.dto.js';
import { answerRefusals } from '../../errors/space/space-refusal.problem.js';
import type { Caller } from '../../../../application/models/caller/caller.model.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toSpaceCreated } from '../../mappers/space/space-created.mapper.js';
import { toSpacesPosition } from '../../mappers/space/space-cursor.mapper.js';
import { toSpacePage } from '../../mappers/space/space-page.mapper.js';
import { toSpacePatch } from '../../mappers/space/space-patch.mapper.js';
import { toSpace } from '../../mappers/space/space.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';

/**
 * Class SpacesController
 *
 * @description
 * The spaces of `openapi/internal/task-service.yaml`, which the gateway calls for `POST`, `GET
 * /v1/spaces` and `GET`, `PATCH /v1/spaces/{spaceId}`. They accept the issuer `api-gateway` only,
 * with the actor `user` and an organization: the guard answers `403 auth.organization-required`
 * without one. The actor and the organization come from the verified internal token, never from
 * the request. The `ETag` (`"<version>"`) of a read or a change is set by the `EtagInterceptor` of
 * the kit from the `version` of the body; the creation sets it itself, its body having none at the
 * top level. The controller validates, maps and delegates: the rules, the visibility of a space
 * and the transaction belong to the use cases.
 */
@Controller('internal/v1/spaces')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class SpacesController {
  // #region Properties
  /**
   * Property createSpace
   *
   * @description
   * Use case of the creation.
   *
   * @type {CreateSpace}
   * @readonly
   */
  private readonly createSpace: CreateSpace;

  /**
   * Property listSpaces
   *
   * @description
   * Use case of the list.
   *
   * @type {ListSpaces}
   * @readonly
   */
  private readonly listSpaces: ListSpaces;

  /**
   * Property getSpace
   *
   * @description
   * Use case of the reading.
   *
   * @type {GetSpace}
   * @readonly
   */
  private readonly getSpace: GetSpace;

  /**
   * Property updateSpace
   *
   * @description
   * Use case of the change.
   *
   * @type {UpdateSpace}
   * @readonly
   */
  private readonly updateSpace: UpdateSpace;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `SpacesModule`.
   *
   * @param {CreateSpace} createSpace - Use case of the creation.
   * @param {ListSpaces} listSpaces - Use case of the list.
   * @param {GetSpace} getSpace - Use case of the reading.
   * @param {UpdateSpace} updateSpace - Use case of the change.
   * @constructor
   */
  public constructor(
    createSpace: CreateSpace,
    listSpaces: ListSpaces,
    getSpace: GetSpace,
    updateSpace: UpdateSpace,
  ) {
    this.createSpace = createSpace;
    this.listSpaces = listSpaces;
    this.getSpace = getSpace;
    this.updateSpace = updateSpace;
  }
  // #endregion

  // #region Methods
  /**
   * Method create
   *
   * @description
   * `POST /internal/v1/spaces`: `201` with the space and its first list "Première liste", created
   * in one transaction, `Location` and `ETag`. With an `Idempotency-Key` the kit records the
   * answer for 24 hours and replays it. A guest gets `403 organization.role-forbidden`; a current
   * or former prefix of another space, `409 space.prefix-taken` with `details.prefix`.
   *
   * @param {CreateSpaceBody} body - The space, with the defaults of the contract applied.
   * @param {Response} response - The response, for `Location` and `ETag`.
   * @returns {Promise<SpaceCreated>} The space and its first list.
   * @throws {ProblemException} `403 organization.role-forbidden`, `404 organization.not-found` or
   * `409 space.prefix-taken`.
   */
  @Post()
  @HttpCode(201)
  public async create(
    @Body() body: CreateSpaceBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SpaceCreated> {
    const caller: Caller = toCaller();
    const created: CreateSpaceOutput = await answerRefusals(() =>
      this.createSpace.execute({
        ...caller,
        name: body.name,
        prefix: body.prefix,
        description: body.description ?? null,
        icon: body.icon,
        color: body.color,
        visibility: body.visibility,
      }),
    );
    response.setHeader('Location', `/internal/v1/spaces/${created.space.space.id}`);
    response.setHeader('ETag', formatEtag(created.space.space.version));
    return toSpaceCreated(created);
  }

  /**
   * Method list
   *
   * @description
   * `GET /internal/v1/spaces`: `200` with one page of the spaces the actor sees, in the order of
   * their creation, each with `callerRole` and `callerCanManage`; a guest gets the spaces of the
   * lists shared with them.
   *
   * @param {ListSpacesQuery} query - The cursor and the page size.
   * @returns {Promise<SpacePageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this list,
   * or `404 organization.not-found`.
   */
  @Get()
  public async list(@Query() query: ListSpacesQuery): Promise<SpacePageBody> {
    const caller: Caller = toCaller();
    const page: ListSpacesOutput = await answerRefusals(() =>
      this.listSpaces.execute({
        ...caller,
        after: toSpacesPosition(query.cursor),
        limit: query.limit,
      }),
    );
    return toSpacePage(page);
  }

  /**
   * Method read
   *
   * @description
   * `GET /internal/v1/spaces/{spaceId}`: `200` with a space the actor sees, `404 space.not-found`
   * for any other.
   *
   * @param {SpacePath} path - The id of the space.
   * @returns {Promise<Space>} The space.
   * @throws {ProblemException} `404 space.not-found`.
   */
  @Get(':spaceId')
  public async read(@Param() path: SpacePath): Promise<Space> {
    const caller: Caller = toCaller();
    const view: SpaceView = await answerRefusals(() =>
      this.getSpace.execute({ ...caller, spaceId: path.spaceId }),
    );
    return toSpace(view);
  }

  /**
   * Method update
   *
   * @description
   * `PATCH /internal/v1/spaces/{spaceId}`: `200` with the space after the merge patch, the same
   * version when nothing changed. `If-Match` is optional. `404 space.not-found`,
   * `403 access.role-insufficient` without `edit` on the space, `403 space.visibility-forbidden`,
   * `409 space.prefix-taken`, `412 request.version-mismatch` with `details.version` and
   * `422 space.status-required` with `details.status` come from the use case.
   *
   * @param {SpacePath} path - The id of the space.
   * @param {UpdateSpaceBody} body - The merge patch.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @returns {Promise<Space>} The space after the change.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Patch(':spaceId')
  public async update(
    @Param() path: SpacePath,
    @Body() body: UpdateSpaceBody,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<Space> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const view: SpaceView = await answerRefusals(() =>
      this.updateSpace.execute({
        ...caller,
        spaceId: path.spaceId,
        expectedVersions,
        patch: toSpacePatch(body),
      }),
    );
    return toSpace(view);
  }
  // #endregion
}
