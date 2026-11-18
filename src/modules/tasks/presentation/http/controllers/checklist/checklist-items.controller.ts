import type { Task } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Body, Controller, Headers, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { AddChecklistItemOutput } from '../../../../application/use-cases/commands/checklist/add-checklist-item/add-checklist-item.output.js';
import { AddChecklistItem } from '../../../../application/use-cases/commands/checklist/add-checklist-item/add-checklist-item.use-case.js';
import type { UpdateChecklistItemOutput } from '../../../../application/use-cases/commands/checklist/update-checklist-item/update-checklist-item.output.js';
import { UpdateChecklistItem } from '../../../../application/use-cases/commands/checklist/update-checklist-item/update-checklist-item.use-case.js';
import { AddChecklistItemBody } from '../../dto/input/checklist/add-checklist-item-body.dto.js';
import { ChecklistItemPath } from '../../dto/input/checklist/checklist-item-path.dto.js';
import { UpdateChecklistItemBody } from '../../dto/input/checklist/update-checklist-item-body.dto.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toTask } from '../../mappers/task/task.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';

/**
 * Class ChecklistItemsController
 *
 * @description
 * The checklist of a task, `POST /internal/v1/tasks/{taskKey}/checklist-items` and `PATCH
 * /internal/v1/tasks/{taskKey}/checklist-items/{checklistItemId}` of
 * `openapi/internal/task-service.yaml`. They accept the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal
 * token, never from the request. Both answer the task, whose `version` the `EtagInterceptor` of
 * the kit turns into the `ETag`. The controller validates, maps and delegates: the rules and the
 * transaction belong to the use cases.
 */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class ChecklistItemsController {
  // #region Properties
  /**
   * Property addChecklistItem
   *
   * @description
   * Use case of the addition.
   *
   * @type {AddChecklistItem}
   * @readonly
   */
  private readonly addChecklistItem: AddChecklistItem;

  /**
   * Property updateChecklistItem
   *
   * @description
   * Use case of the change.
   *
   * @type {UpdateChecklistItem}
   * @readonly
   */
  private readonly updateChecklistItem: UpdateChecklistItem;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `TasksModule`.
   *
   * @param {AddChecklistItem} addChecklistItem - Use case of the addition.
   * @param {UpdateChecklistItem} updateChecklistItem - Use case of the change.
   * @constructor
   */
  public constructor(addChecklistItem: AddChecklistItem, updateChecklistItem: UpdateChecklistItem) {
    this.addChecklistItem = addChecklistItem;
    this.updateChecklistItem = updateChecklistItem;
  }
  // #endregion

  // #region Methods
  /**
   * Method add
   *
   * @description
   * `POST /internal/v1/tasks/{taskKey}/checklist-items`: `201` with the task and `Location:
   * /internal/v1/tasks/<key>/checklist-items/<checklistItemId>`; the item is added unticked at the
   * end. With an `Idempotency-Key` (applied by `tasks.module.ts`) the kit records the answer for
   * 24 hours and replays it with the recorded `Location` and `ETag`. The contract declares no
   * `If-Match` here. `404 task.not-found` and `422 task.checklist-limit-reached` come from the use
   * case.
   *
   * @param {TaskPath} path - The key of the task.
   * @param {AddChecklistItemBody} body - The text of the item.
   * @param {Response} response - The response, for `Location`.
   * @returns {Promise<Task>} The task after the change.
   * @throws {ProblemException} The refusals above.
   */
  @Post(':taskKey/checklist-items')
  @HttpCode(201)
  public async add(
    @Param() path: TaskPath,
    @Body() body: AddChecklistItemBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Task> {
    const caller: Caller = toCaller();
    const created: AddChecklistItemOutput = await answerRefusals(() =>
      this.addChecklistItem.execute({ ...caller, taskKey: path.taskKey, text: body.text }),
    );
    response.setHeader(
      'Location',
      `/internal/v1/tasks/${created.task.key}/checklist-items/${created.checklistItemId}`,
    );
    return toTask(created.task);
  }

  /**
   * Method update
   *
   * @description
   * `PATCH /internal/v1/tasks/{taskKey}/checklist-items/{checklistItemId}`: `200` with the task
   * after the item was ticked or unticked, the same version when it already was in that state.
   * `If-Match` is optional. `404 task.not-found`, `404 checklist-item.not-found` and `412
   * request.version-mismatch` with `details.version` come from the use case.
   *
   * @param {ChecklistItemPath} path - The key of the task and the id of the item.
   * @param {UpdateChecklistItemBody} body - The state of the item.
   * @param {string | undefined} ifMatch - The `If-Match` header, optional.
   * @returns {Promise<Task>} The task after the change.
   * @throws {ProblemException} The refusals above, or `400 request.invalid` for a malformed
   * `If-Match`.
   */
  @Patch(':taskKey/checklist-items/:checklistItemId')
  public async update(
    @Param() path: ChecklistItemPath,
    @Body() body: UpdateChecklistItemBody,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<Task> {
    const caller: Caller = toCaller();
    const expectedVersions: readonly number[] | null = toExpectedVersions(ifMatch);
    const view: UpdateChecklistItemOutput = await answerRefusals(() =>
      this.updateChecklistItem.execute({
        ...caller,
        taskKey: path.taskKey,
        checklistItemId: path.checklistItemId.toLowerCase(),
        done: body.done,
        expectedVersions,
      }),
    );
    return toTask(view);
  }
  // #endregion
}
