import type { BulkTaskResult } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess, ProblemException } from '@cadenway/nest-common';
import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';

import { BulkTaskExpansionError } from '../../../../application/models/bulk/bulk-task-expansion.model.js';
import { BulkTaskAction } from '../../../../application/use-cases/commands/bulk/bulk-task-action/bulk-task-action.use-case.js';
import { BulkTaskActionBody } from '../../dto/input/bulk/bulk-task-action-body.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/** Exposes the atomic bulk action to the API gateway in the caller's organization. */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class BulkTaskActionsController {
  // #region Constructor
  /** Binds the use case that owns the transaction and its authorization. */
  public constructor(private readonly bulkTaskAction: BulkTaskAction) {}
  // #endregion

  // #region Methods
  /** Applies one action to the explicit selection and returns one result per selected key. */
  @Post('bulk-actions')
  @HttpCode(200)
  public async execute(
    @Body() body: BulkTaskActionBody,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BulkTaskResult> {
    try {
      const result = await answerRefusals(() =>
        this.bulkTaskAction.execute({
          ...toCaller(),
          selection: body.selection,
          action: body.action,
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
        }),
      );
      return {
        results: result.results.map((entry) => ({
          taskKey: entry.taskKey,
          ...(entry.version === undefined ? {} : { version: entry.version }),
          ...(entry.newTaskKey === undefined ? {} : { newTaskKey: entry.newTaskKey }),
          ...(entry.newTaskVersion === undefined ? {} : { newTaskVersion: entry.newTaskVersion }),
          ...(entry.successorKey === undefined ? {} : { successorKey: entry.successorKey }),
          ...(entry.successorVersion === undefined
            ? {}
            : { successorVersion: entry.successorVersion }),
          ...(entry.trashEntryId === undefined ? {} : { trashEntryId: entry.trashEntryId }),
        })),
        affectedCount: result.affectedCount,
      };
    } catch (error) {
      if (error instanceof BulkTaskExpansionError) {
        throw new ProblemException({ status: 422, code: 'bulk.expansion-limit-reached' });
      }
      throw error;
    }
  }
  // #endregion
}
