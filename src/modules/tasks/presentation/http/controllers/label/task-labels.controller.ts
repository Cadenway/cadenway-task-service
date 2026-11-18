import type { Task } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { AddTaskLabelOutput } from '../../../../application/use-cases/commands/label/add-task-label/add-task-label.output.js';
import { AddTaskLabel } from '../../../../application/use-cases/commands/label/add-task-label/add-task-label.use-case.js';
import type { RemoveTaskLabelOutput } from '../../../../application/use-cases/commands/label/remove-task-label/remove-task-label.output.js';
import { RemoveTaskLabel } from '../../../../application/use-cases/commands/label/remove-task-label/remove-task-label.use-case.js';
import { AddTaskLabelBody } from '../../dto/input/label/add-task-label-body.dto.js';
import { RemoveTaskLabelBody } from '../../dto/input/label/remove-task-label-body.dto.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toTask } from '../../mappers/task/task.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';

/**
 * Class TaskLabelsController
 *
 * @description
 * The labels of a task, `POST /internal/v1/tasks/{taskKey}/labels/add` and `.../labels/remove` of
 * `openapi/internal/task-service.yaml`. They accept the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal
 * token, never from the request. The `ETag` comes from the `version` of the body, set by the
 * `EtagInterceptor` of the kit. The controller validates, maps and delegates: the rules and the
 * transaction belong to the use cases.
 */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskLabelsController {
  // #region Properties
  /**
   * Property addTaskLabel
   *
   * @description
   * Use case of the addition.
   *
   * @type {AddTaskLabel}
   * @readonly
   */
  private readonly addTaskLabel: AddTaskLabel;

  /**
   * Property removeTaskLabel
   *
   * @description
   * Use case of the removal.
   *
   * @type {RemoveTaskLabel}
   * @readonly
   */
  private readonly removeTaskLabel: RemoveTaskLabel;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `TasksModule`.
   *
   * @param {AddTaskLabel} addTaskLabel - Use case of the addition.
   * @param {RemoveTaskLabel} removeTaskLabel - Use case of the removal.
   * @constructor
   */
  public constructor(addTaskLabel: AddTaskLabel, removeTaskLabel: RemoveTaskLabel) {
    this.addTaskLabel = addTaskLabel;
    this.removeTaskLabel = removeTaskLabel;
  }
  // #endregion

  // #region Methods
  /**
   * Method add
   *
   * @description
   * `POST /internal/v1/tasks/{taskKey}/labels/add`: `200` with the task, the same version when
   * the label is already there (two labels that differ only by case are the same). `If-Match` is
   * optional. `404 task.not-found`, `412 request.version-mismatch` with `details.version` and
   * `422 task.label-limit-reached` come from the use case.
   *
   * @param {TaskPath} path - The key of the task.
   * @param {AddTaskLabelBody} body - The label.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @returns {Promise<Task>} The task after the change.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Post(':taskKey/labels/add')
  @HttpCode(200)
  public async add(
    @Param() path: TaskPath,
    @Body() body: AddTaskLabelBody,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<Task> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const view: AddTaskLabelOutput = await answerRefusals(() =>
      this.addTaskLabel.execute({
        ...caller,
        taskKey: path.taskKey,
        name: body.name,
        expectedVersions,
      }),
    );
    return toTask(view);
  }

  /**
   * Method remove
   *
   * @description
   * `POST /internal/v1/tasks/{taskKey}/labels/remove`: `200` with the task, the same version when
   * the label is not there. `If-Match` is optional. `404 task.not-found` and `412
   * request.version-mismatch` with `details.version` come from the use case.
   *
   * @param {TaskPath} path - The key of the task.
   * @param {RemoveTaskLabelBody} body - The label.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @returns {Promise<Task>} The task after the change.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Post(':taskKey/labels/remove')
  @HttpCode(200)
  public async remove(
    @Param() path: TaskPath,
    @Body() body: RemoveTaskLabelBody,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<Task> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const view: RemoveTaskLabelOutput = await answerRefusals(() =>
      this.removeTaskLabel.execute({
        ...caller,
        taskKey: path.taskKey,
        name: body.name,
        expectedVersions,
      }),
    );
    return toTask(view);
  }
  // #endregion
}
