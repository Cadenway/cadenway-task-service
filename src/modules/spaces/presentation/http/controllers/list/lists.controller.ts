import type { TaskList } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import type { ArchiveListOutput } from '../../../../application/use-cases/commands/list/archive-list/archive-list.output.js';
import { ArchiveList } from '../../../../application/use-cases/commands/list/archive-list/archive-list.use-case.js';
import { DeleteList } from '../../../../application/use-cases/commands/list/delete-list/delete-list.use-case.js';
import type { UnarchiveListOutput } from '../../../../application/use-cases/commands/list/unarchive-list/unarchive-list.output.js';
import { UnarchiveList } from '../../../../application/use-cases/commands/list/unarchive-list/unarchive-list.use-case.js';
import type { UpdateListOutput } from '../../../../application/use-cases/commands/list/update-list/update-list.output.js';
import { UpdateList } from '../../../../application/use-cases/commands/list/update-list/update-list.use-case.js';
import type { GetListOutput } from '../../../../application/use-cases/queries/list/get-list/get-list.output.js';
import { GetList } from '../../../../application/use-cases/queries/list/get-list/get-list.use-case.js';
import { ArchiveListBody } from '../../dto/input/list/archive-list-body.dto.js';
import { ListPath } from '../../dto/input/list/list-path.dto.js';
import { UnarchiveListBody } from '../../dto/input/list/unarchive-list-body.dto.js';
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
 * /v1/lists/{listId}`, for its actions `archive` and `unarchive` (`openapi/public/archives.yaml`)
 * and for `DELETE /v1/lists/{listId}`.
 * They accept the issuer `api-gateway` only, with the actor `user` and an organization. The actor
 * and the organization come from the verified internal token, never from the request. The `ETag`
 * (`"<version>"`) is set by the `EtagInterceptor` of the kit from the `version` of the body. The
 * controller validates, maps and delegates: the visibility of the space of the list and the
 * transaction belong to the use cases.
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

  /**
   * Property archiveList
   *
   * @description
   * Use case of the archive.
   *
   * @type {ArchiveList}
   * @readonly
   */
  private readonly archiveList: ArchiveList;

  /**
   * Property unarchiveList
   *
   * @description
   * Use case of the restoration.
   *
   * @type {UnarchiveList}
   * @readonly
   */
  private readonly unarchiveList: UnarchiveList;

  /**
   * Property deleteList
   *
   * @description
   * Use case of the deletion.
   *
   * @type {DeleteList}
   * @readonly
   */
  private readonly deleteList: DeleteList;
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
   * @param {ArchiveList} archiveList - Use case of the archive.
   * @param {UnarchiveList} unarchiveList - Use case of the restoration.
   * @param {DeleteList} deleteList - Use case of the deletion.
   * @constructor
   */
  public constructor(
    getList: GetList,
    updateList: UpdateList,
    archiveList: ArchiveList,
    unarchiveList: UnarchiveList,
    deleteList: DeleteList,
  ) {
    this.getList = getList;
    this.updateList = updateList;
    this.archiveList = archiveList;
    this.unarchiveList = unarchiveList;
    this.deleteList = deleteList;
  }
  // #endregion

  // #region Methods
  /**
   * Method read
   *
   * @description
   * `GET /internal/v1/lists/{listId}`: `200` with a list the actor has a role on, with
   * `callerRole`, and `archivedAt` and `archivedBy` for an archived one; `404 list.not-found` for
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
   * `403 access.role-insufficient` without `edit` on the list, `412 request.version-mismatch` with
   * `details.version` and `422 list.sprint-dates-invalid` come from the use case.
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

  /**
   * Method archive
   *
   * @description
   * `POST /internal/v1/lists/{listId}/archive` (`archiveListInternal`): `200` with the list,
   * `archivedAt` and `archivedBy` set, the same version when it was archived already. `If-Match`
   * is optional. `404 list.not-found`, `403 access.role-insufficient` without `edit` on the list
   * and `412 request.version-mismatch` with `details.version`, in this order, come from the use
   * case.
   *
   * @param {ListPath} path - The id of the list.
   * @param {ArchiveListBody} _body - The empty object of the contract, validated, not read.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @returns {Promise<TaskList>} The list, archived.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a body that is not
   * an object or a malformed `If-Match`.
   */
  @Post(':listId/archive')
  @HttpCode(200)
  public async archive(
    @Param() path: ListPath,
    @Body() _body: ArchiveListBody,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<TaskList> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const state: ArchiveListOutput = await answerRefusals(() =>
      this.archiveList.execute({ ...caller, listId: path.listId, expectedVersions }),
    );
    return toTaskList(state);
  }

  /**
   * Method unarchive
   *
   * @description
   * `POST /internal/v1/lists/{listId}/unarchive` (`unarchiveListInternal`): `200` with the list
   * back at the end of its space, `archivedAt` and `archivedBy` back to `null`, the same version
   * when it was live. `If-Match` is optional. `404 list.not-found`,
   * `403 access.role-insufficient` without `edit` on the list and `412 request.version-mismatch`
   * with `details.version`, in this order, come from the use case.
   *
   * @param {ListPath} path - The id of the list.
   * @param {UnarchiveListBody} _body - The empty object of the contract, validated, not read.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @returns {Promise<TaskList>} The list, restored.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a body that is not
   * an object or a malformed `If-Match`.
   */
  @Post(':listId/unarchive')
  @HttpCode(200)
  public async unarchive(
    @Param() path: ListPath,
    @Body() _body: UnarchiveListBody,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<TaskList> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const state: UnarchiveListOutput = await answerRefusals(() =>
      this.unarchiveList.execute({ ...caller, listId: path.listId, expectedVersions }),
    );
    return toTaskList(state);
  }

  /**
   * Method delete
   *
   * @description
   * `DELETE /internal/v1/lists/{listId}` (`deleteListInternal`): `204` without a body, once the
   * list is a tombstone and the job that moves its tasks to the trash is enqueued. `If-Match` is
   * optional. `404 list.not-found` (a deleted list included), `403 access.role-insufficient`
   * without `edit` on the list, archived or not, and `412 request.version-mismatch` with
   * `details.version`, in this order, come from the use case.
   *
   * @param {ListPath} path - The id of the list.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @returns {Promise<void>} Resolves once deleted.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Delete(':listId')
  @HttpCode(204)
  public async delete(
    @Param() path: ListPath,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    await answerRefusals(() =>
      this.deleteList.execute({ ...caller, listId: path.listId, expectedVersions }),
    );
  }
  // #endregion
}
