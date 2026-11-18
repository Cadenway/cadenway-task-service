import type { Task } from '@cadenway/contracts/types/internal/task-service';
import { formatEtag, InternalAccess } from '@cadenway/nest-common';
import { Controller, Delete, Headers, HttpCode, Param, Put, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { AssignTaskOutput } from '../../../../application/use-cases/commands/assignee/assign-task/assign-task.output.js';
import { AssignTask } from '../../../../application/use-cases/commands/assignee/assign-task/assign-task.use-case.js';
import type { UnassignTaskOutput } from '../../../../application/use-cases/commands/assignee/unassign-task/unassign-task.output.js';
import { UnassignTask } from '../../../../application/use-cases/commands/assignee/unassign-task/unassign-task.use-case.js';
import { AssigneePath } from '../../dto/input/assignee/assignee-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toTask } from '../../mappers/task/task.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';

/**
 * Class TaskAssigneesController
 *
 * @description
 * The assignees of a task, `PUT` and `DELETE /internal/v1/tasks/{taskKey}/assignees/{userId}` of
 * `openapi/internal/task-service.yaml`. They accept the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal
 * token, never from the request; `userId` of the path is the person to assign or to remove, not
 * the actor. The controller validates, maps and delegates: the rules and the transaction belong
 * to the use cases.
 */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskAssigneesController {
  // #region Properties
  /**
   * Property assignTask
   *
   * @description
   * Use case of the assignment.
   *
   * @type {AssignTask}
   * @readonly
   */
  private readonly assignTask: AssignTask;

  /**
   * Property unassignTask
   *
   * @description
   * Use case of the removal.
   *
   * @type {UnassignTask}
   * @readonly
   */
  private readonly unassignTask: UnassignTask;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `TasksModule`.
   *
   * @param {AssignTask} assignTask - Use case of the assignment.
   * @param {UnassignTask} unassignTask - Use case of the removal.
   * @constructor
   */
  public constructor(assignTask: AssignTask, unassignTask: UnassignTask) {
    this.assignTask = assignTask;
    this.unassignTask = unassignTask;
  }
  // #endregion

  // #region Methods
  /**
   * Method assign
   *
   * @description
   * `PUT /internal/v1/tasks/{taskKey}/assignees/{userId}`: `200` with the task, the same version
   * when the person was already assigned. The body of the contract is the empty object `{}`: there
   * is nothing to read, so the handler takes none. `If-Match` is optional. `404 task.not-found`,
   * `412 request.version-mismatch` with `details.version`, `422 task.assignee-invalid` with
   * `details.userIds` and `422 task.assignee-limit-reached` come from the use case.
   *
   * @param {AssigneePath} path - The key of the task and the account of the person.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @returns {Promise<Task>} The task after the change.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Put(':taskKey/assignees/:userId')
  public async assign(
    @Param() path: AssigneePath,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<Task> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const view: AssignTaskOutput = await answerRefusals(() =>
      this.assignTask.execute({
        ...caller,
        taskKey: path.taskKey,
        userId: path.userId.toLowerCase(),
        expectedVersions,
      }),
    );
    return toTask(view);
  }

  /**
   * Method unassign
   *
   * @description
   * `DELETE /internal/v1/tasks/{taskKey}/assignees/{userId}`: `204` with the `ETag` of the version
   * after the change, the current version when the person was not assigned. `If-Match` is
   * optional. `404 task.not-found` and `412 request.version-mismatch` with `details.version` come
   * from the use case.
   *
   * @param {AssigneePath} path - The key of the task and the account of the person.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @param {Response} response - The response, for `ETag`.
   * @returns {Promise<void>} Nothing: the answer has no body.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Delete(':taskKey/assignees/:userId')
  @HttpCode(204)
  public async unassign(
    @Param() path: AssigneePath,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const result: UnassignTaskOutput = await answerRefusals(() =>
      this.unassignTask.execute({
        ...caller,
        taskKey: path.taskKey,
        userId: path.userId.toLowerCase(),
        expectedVersions,
      }),
    );
    response.setHeader('ETag', formatEtag(result.version));
  }
  // #endregion
}
