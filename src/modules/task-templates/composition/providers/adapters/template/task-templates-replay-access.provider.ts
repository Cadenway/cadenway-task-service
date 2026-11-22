import {
  CreateTaskTemplateInternalParams,
  CreateTaskTemplateInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { ProblemException } from '@cadenway/nest-common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';

import { authorizeIdempotentReplay } from '../../../../../../infrastructure/http/authorize-idempotent-replay.js';
import { GetTaskTemplate } from '../../../../application/use-cases/queries/template/get-task-template/get-task-template.use-case.js';
import { TaskTemplatesController } from '../../../../presentation/http/controllers/template/task-templates.controller.js';
import { answerTaskTemplateRefusal } from '../../../../presentation/http/errors/template/task-template-refusal.problem.js';
import { toTaskTemplateCaller } from '../../../../presentation/http/mappers/template/task-template-caller.mapper.js';

const templateReceipt = CreateTaskTemplateInternalResponse.pick({ id: true, spaceId: true });

/** Protects a stored snapshot with current library visibility. */
@Injectable()
export class TaskTemplateReplayAccessInterceptor implements NestInterceptor {
  // #region Constructor
  /** Reuses the visibility rules for reading a template. */
  public constructor(private readonly templates: GetTaskTemplate) {}
  // #endregion

  // #region Methods
  /** Authorizes creation receipts after the kit has replayed them. */
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (
      context.getType() !== 'http' ||
      context.getHandler() !== TaskTemplatesController.prototype.create
    ) {
      return next.handle();
    }
    return authorizeIdempotentReplay(
      context,
      next,
      'space.not-found',
      async (request, body) => {
        const params = CreateTaskTemplateInternalParams.safeParse(request.params);
        const receipt = templateReceipt.safeParse(body);
        if (
          !params.success ||
          !receipt.success ||
          params.data.spaceId.toLowerCase() !== receipt.data.spaceId
        ) {
          throw new ProblemException({ status: 404, code: 'template.not-found' });
        }
        await answerTaskTemplateRefusal(() =>
          this.templates.execute(toTaskTemplateCaller(receipt.data.spaceId), receipt.data.id),
        );
      },
      404,
    );
  }
  // #endregion
}
