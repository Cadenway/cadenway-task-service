import type { Task } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { ArchiveTaskOutput } from '../../../../application/use-cases/commands/archive/archive-task/archive-task.output.js';
import { ArchiveTask } from '../../../../application/use-cases/commands/archive/archive-task/archive-task.use-case.js';
import type { UnarchiveTaskOutput } from '../../../../application/use-cases/commands/archive/unarchive-task/unarchive-task.output.js';
import { UnarchiveTask } from '../../../../application/use-cases/commands/archive/unarchive-task/unarchive-task.use-case.js';
import { ArchiveTaskBody } from '../../dto/input/archive/archive-task-body.dto.js';
import { UnarchiveTaskBody } from '../../dto/input/archive/unarchive-task-body.dto.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toTask } from '../../mappers/task/task.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';

/**
 * Class TaskArchiveController
 *
 * @description
 * The archive of a task, `POST /internal/v1/tasks/{taskKey}/archive` (`archiveTaskInternal`) and
 * `POST /internal/v1/tasks/{taskKey}/unarchive` (`unarchiveTaskInternal`) of
 * `openapi/internal/task-service.yaml`. They accept the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal
 * token, never from the request. Both answer `200` with a `Task`, whose `version` the
 * `EtagInterceptor` of the kit turns into the `ETag`. The controller validates, maps and
 * delegates: the subtree, the restoration of the list and the transaction belong to the use cases.
 */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskArchiveController {
  // #region Properties
  /**
   * Property archiveTask
   *
   * @description
   * Use case of the archive.
   *
   * @type {ArchiveTask}
   * @readonly
   */
  private readonly archiveTask: ArchiveTask;

  /**
   * Property unarchiveTask
   *
   * @description
   * Use case of the restoration.
   *
   * @type {UnarchiveTask}
   * @readonly
   */
  private readonly unarchiveTask: UnarchiveTask;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `TasksModule`.
   *
   * @param {ArchiveTask} archiveTask - Use case of the archive.
   * @param {UnarchiveTask} unarchiveTask - Use case of the restoration.
   * @constructor
   */
  public constructor(archiveTask: ArchiveTask, unarchiveTask: UnarchiveTask) {
    this.archiveTask = archiveTask;
    this.unarchiveTask = unarchiveTask;
  }
  // #endregion

  // #region Methods
  /**
   * Method archive
   *
   * @description
   * `POST /internal/v1/tasks/{taskKey}/archive`: `200` with the task, `archivedAt` and `archivedBy`
   * set, the same version when it was archived already. `If-Match` is optional, on the version of
   * the task. `404 task.not-found`, `403 access.role-insufficient` without `edit` on its list and
   * `412 request.version-mismatch` with `details.version`, in this order, come from the use case.
   *
   * @param {TaskPath} path - The key of the task.
   * @param {ArchiveTaskBody} _body - The empty object of the contract, validated, not read.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @returns {Promise<Task>} The task, archived.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a body that is not
   * an object or a malformed `If-Match`.
   */
  @Post(':taskKey/archive')
  @HttpCode(200)
  public async archive(
    @Param() path: TaskPath,
    @Body() _body: ArchiveTaskBody,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<Task> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const view: ArchiveTaskOutput = await answerRefusals(() =>
      this.archiveTask.execute({ ...caller, taskKey: path.taskKey, expectedVersions }),
    );
    return toTask(view);
  }

  /**
   * Method unarchive
   *
   * @description
   * `POST /internal/v1/tasks/{taskKey}/unarchive`: `200` with the root of the archive the task
   * belongs to, back in its list, `archivedAt` and `archivedBy` back to `null`; the task of the
   * path at the same version when it was not archived. `If-Match` is optional, on the version of
   * the task of the path. `404 task.not-found`, `403 access.role-insufficient` without `edit` on
   * its list and `412 request.version-mismatch` with `details.version`, in this order, come from
   * the use case.
   *
   * @param {TaskPath} path - The key of the task.
   * @param {UnarchiveTaskBody} _body - The empty object of the contract, validated, not read.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @returns {Promise<Task>} The root, restored.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a body that is not
   * an object or a malformed `If-Match`.
   */
  @Post(':taskKey/unarchive')
  @HttpCode(200)
  public async unarchive(
    @Param() path: TaskPath,
    @Body() _body: UnarchiveTaskBody,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<Task> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const view: UnarchiveTaskOutput = await answerRefusals(() =>
      this.unarchiveTask.execute({ ...caller, taskKey: path.taskKey, expectedVersions }),
    );
    return toTask(view);
  }
  // #endregion
}
