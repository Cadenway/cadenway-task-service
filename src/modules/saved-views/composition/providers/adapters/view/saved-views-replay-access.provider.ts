import {
  CreateSavedViewInternalParams,
  CreateSavedViewInternalResponse,
  DuplicateSavedViewInternalParams,
} from '@cadenway/contracts/validators/internal/task-service';
import { ProblemException } from '@cadenway/nest-common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';

import { authorizeIdempotentReplay } from '../../../../../../infrastructure/http/authorize-idempotent-replay.js';
import { GetSavedView } from '../../../../application/use-cases/queries/view/get-saved-view/get-saved-view.use-case.js';
import { SavedViewsController } from '../../../../presentation/http/controllers/view/saved-views.controller.js';
import { answerSavedViewRefusals } from '../../../../presentation/http/errors/view/saved-view.problem.js';
import { toItem } from '../../../../presentation/http/mappers/view/saved-view.mapper.js';

const viewReceipt = CreateSavedViewInternalResponse.pick({ id: true, listId: true });

/** Protects stored view settings with current visibility of the list and view. */
@Injectable()
export class SavedViewReplayAccessInterceptor implements NestInterceptor {
  // #region Constructor
  /** Uses the view's current read permissions. */
  public constructor(private readonly views: GetSavedView) {}
  // #endregion

  // #region Methods
  /** Authorizes creation and duplication receipts after the kit has replayed them. */
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const duplicate = handler === SavedViewsController.prototype.duplicate;
    if (
      context.getType() !== 'http' ||
      (!duplicate && handler !== SavedViewsController.prototype.create)
    ) {
      return next.handle();
    }
    return authorizeIdempotentReplay(
      context,
      next,
      duplicate ? 'saved-view.not-found' : 'list.not-found',
      async (request, body) => {
        const schema = duplicate ? DuplicateSavedViewInternalParams : CreateSavedViewInternalParams;
        const collection = schema.safeParse(request.params);
        const receipt = viewReceipt.safeParse(body);
        if (
          !collection.success ||
          !receipt.success ||
          collection.data.listId.toLowerCase() !== receipt.data.listId
        ) {
          throw new ProblemException({ status: 404, code: 'saved-view.not-found' });
        }

        await answerSavedViewRefusals(() =>
          this.views.execute(toItem(receipt.data.listId, receipt.data.id)),
        );
      },
      duplicate ? undefined : 404,
    );
  }
  // #endregion
}
