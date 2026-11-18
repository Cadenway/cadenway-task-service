import type { TaskList } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Body, Controller, Get, Headers, Param, Patch } from '@nestjs/common';

import type { UpdateListOutput } from '../../../../application/use-cases/commands/list/update-list/update-list.output.js';
import { UpdateList } from '../../../../application/use-cases/commands/list/update-list/update-list.use-case.js';
import type { GetListOutput } from '../../../../application/use-cases/queries/list/get-list/get-list.output.js';
import { GetList } from '../../../../application/use-cases/queries/list/get-list/get-list.use-case.js';
import { ListPath } from '../../dto/input/list/list-path.dto.js';
import { UpdateListBody } from '../../dto/input/list/update-list-body.dto.js';
import { answerRefusals } from '../../errors/space/space-refusal.problem.js';
import type { Caller } from '../../../../application/models/caller/caller.model.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toTaskListPatch } from '../../mappers/list/task-list-patch.mapper.js';
import { toTaskList } from '../../mappers/list/task-list.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';

/**
 * Class ListsController
 *
 * @description
 * The lists of `openapi/internal/task-service.yaml`, which the gateway calls for `GET` and `PATCH
 * /v1/lists/{listId}`. They accept the issuer `api-gateway` only, with the actor `user` and an
 * organization. The actor and the organization come from the verified internal token, never from
 * the request. The `ETag` (`"<version>"`) is set by the `EtagInterceptor` of the kit from the
 * `version` of the body. The controller validates, maps and delegates: the visibility of the space
 * of the list and the transaction belong to the use cases.
 */
@Controller('internal/v1/lists')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class ListsController {
  // #region Properties
  /**
   * Property getList
   *
   * @description
   * Use case of the reading.
   *
   * @type {GetList}
   * @readonly
   */
  private readonly getList: GetList;

  /**
   * Property updateList
   *
   * @description
   * Use case of the change.
   *
   * @type {UpdateList}
   * @readonly
   */
  private readonly updateList: UpdateList;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `SpacesModule`.
   *
   * @param {GetList} getList - Use case of the reading.
   * @param {UpdateList} updateList - Use case of the change.
   * @constructor
   */
  public constructor(getList: GetList, updateList: UpdateList) {
    this.getList = getList;
    this.updateList = updateList;
  }
  // #endregion

  // #region Methods
  /**
   * Method read
   *
   * @description
   * `GET /internal/v1/lists/{listId}`: `200` with a list the actor sees, `404 list.not-found` for
   * any other.
   *
   * @param {ListPath} path - The id of the list.
   * @returns {Promise<TaskList>} The list.
   * @throws {ProblemException} `404 list.not-found`.
   */
  @Get(':listId')
  public async read(@Param() path: ListPath): Promise<TaskList> {
    const caller: Caller = toCaller();
    const state: GetListOutput = await answerRefusals(() =>
      this.getList.execute({ ...caller, listId: path.listId }),
    );
    return toTaskList(state);
  }

  /**
   * Method update
   *
   * @description
   * `PATCH /internal/v1/lists/{listId}`: `200` with the list after the merge patch, the same
   * version when nothing changed. `If-Match` is optional. `404 list.not-found`,
   * `412 request.version-mismatch` with `details.version` and `422 list.sprint-dates-invalid`
   * come from the use case.
   *
   * @param {ListPath} path - The id of the list.
   * @param {UpdateListBody} body - The merge patch.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @returns {Promise<TaskList>} The list after the change.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Patch(':listId')
  public async update(
    @Param() path: ListPath,
    @Body() body: UpdateListBody,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<TaskList> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const state: UpdateListOutput = await answerRefusals(() =>
      this.updateList.execute({
        ...caller,
        listId: path.listId,
        expectedVersions,
        patch: toTaskListPatch(body),
      }),
    );
    return toTaskList(state);
  }
  // #endregion
}
