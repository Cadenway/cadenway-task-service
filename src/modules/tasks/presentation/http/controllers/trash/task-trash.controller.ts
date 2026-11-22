import type { TrashEntry } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { TrashTaskOutput } from '../../../../application/use-cases/commands/trash/trash-task/trash-task.output.js';
import { TrashTask } from '../../../../application/use-cases/commands/trash/trash-task/trash-task.use-case.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { TrashTaskBody } from '../../dto/input/trash/trash-task-body.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toTrashEntry } from '../../mappers/trash/trash-entry.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';

/**
 * Class TaskTrashController
 *
 * @description
 * "Supprimer la tâche" (`trashTaskInternal` of `openapi/internal/task-service.yaml`): the
 * empty object of the contract as body (`EmptyRequest`, validated, not read) and an optional
 * `If-Match` on the version of the task; `200` with the entry (`TrashEntry`, no `ETag`). Issuer
 * `api-gateway`, actor `user`, organization required. The key is checked by the contract
 * validator of the path (`400 request.invalid` otherwise). While the switch of the writes of the
 * trash is off, the route answers as one the service does not have (`404 http.not-found`, after
 * the guard and the validation).
 */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskTrashController {
  // #region Properties
  /** The deletion of a task. */
  private readonly trashTask: TrashTask;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use case.
   *
   * @param {TrashTask} trashTask - The deletion of a task.
   * @constructor
   */
  public constructor(trashTask: TrashTask) {
    this.trashTask = trashTask;
  }
  // #endregion

  // #region Methods
  /**
   * Method trash
   *
   * @description
   * `POST /internal/v1/tasks/{taskKey}/trash`: moves the task and its subtasks to the trash.
   *
   * @param {TaskPath} path - The key of the task.
   * @param {TrashTaskBody} _body - The empty object of the contract.
   * @param {string | undefined} ifMatch - The `If-Match` header, if any.
   * @param {Request} request - The request, whose route an answer of an unknown route names.
   * @returns {Promise<TrashEntry>} The entry.
   * @throws {ProblemException} `404 http.not-found` while the switch is off, `404 task.not-found`,
   * `404 task.trashed`,
   * `403 access.role-insufficient`, `409 task.archived`, `409 trash.tree-too-large`,
   * `412 request.version-mismatch`,
   * `404 organization.not-found`.
   */
  @Post(':taskKey/trash')
  @HttpCode(200)
  public async trash(
    @Param() path: TaskPath,
    @Body() _body: TrashTaskBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
  ): Promise<TrashEntry> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const entry: TrashTaskOutput = await answerRefusals(
      () => this.trashTask.execute({ ...caller, taskKey: path.taskKey, expectedVersions }),
      request,
    );
    return toTrashEntry(entry);
  }
  // #endregion
}
