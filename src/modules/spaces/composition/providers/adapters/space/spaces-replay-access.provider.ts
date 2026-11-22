import {
  CreateListInternalParams,
  CreateListInternalResponse,
  CreateSpaceInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { ProblemException } from '@cadenway/nest-common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';

import { authorizeIdempotentReplay } from '../../../../../../infrastructure/http/authorize-idempotent-replay.js';
import { GetList } from '../../../../application/use-cases/queries/list/get-list/get-list.use-case.js';
import { GetSpace } from '../../../../application/use-cases/queries/space/get-space/get-space.use-case.js';
import { SpaceListsController } from '../../../../presentation/http/controllers/list/space-lists.controller.js';
import { SpacesController } from '../../../../presentation/http/controllers/space/spaces.controller.js';
import { answerRefusals } from '../../../../presentation/http/errors/space/space-refusal.problem.js';
import { toCaller } from '../../../../presentation/http/mappers/caller/caller.mapper.js';

const listReceipt = CreateListInternalResponse.pick({ id: true, spaceId: true });
const spaceReceipt = CreateSpaceInternalResponse.pick({ space: true, firstList: true }).extend({
  space: CreateSpaceInternalResponse.shape.space.pick({ id: true }),
  firstList: listReceipt,
});

/** Protects stored space and list creation receipts with current visibility. */
@Injectable()
export class SpacesReplayAccessInterceptor implements NestInterceptor {
  // #region Constructor
  /** Uses the current read permissions for both resources. */
  public constructor(
    private readonly spaces: GetSpace,
    private readonly lists: GetList,
  ) {}
  // #endregion

  // #region Methods
  /** Checks existing receipts before they leave the HTTP boundary. */
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const handler = context.getHandler();
    if (handler === SpacesController.prototype.create) {
      return authorizeIdempotentReplay(
        context,
        next,
        'organization.role-forbidden',
        async (_request, body) => {
          const receipt = spaceReceipt.safeParse(body);
          if (!receipt.success || receipt.data.space.id !== receipt.data.firstList.spaceId) {
            throw new ProblemException({ status: 404, code: 'space.not-found' });
          }
          await answerRefusals(async () => {
            const caller = toCaller();
            await this.spaces.execute({ ...caller, spaceId: receipt.data.space.id });
            await this.requireListPlacement(receipt.data.firstList.id, receipt.data.space.id);
          });
        },
        403,
      );
    }
    if (handler === SpaceListsController.prototype.create) {
      return authorizeIdempotentReplay(
        context,
        next,
        'space.not-found',
        async (request, body) => {
          const params = CreateListInternalParams.safeParse(request.params);
          const receipt = listReceipt.safeParse(body);
          if (
            !params.success ||
            !receipt.success ||
            params.data.spaceId.toLowerCase() !== receipt.data.spaceId
          ) {
            throw new ProblemException({ status: 404, code: 'list.not-found' });
          }
          await answerRefusals(() =>
            this.requireListPlacement(receipt.data.id, receipt.data.spaceId),
          );
        },
        404,
      );
    }
    return next.handle();
  }

  private async requireListPlacement(listId: string, spaceId: string): Promise<void> {
    const current = await this.lists.execute({ ...toCaller(), listId });
    if (current.list.spaceId !== spaceId) {
      throw new ProblemException({ status: 404, code: 'list.not-found' });
    }
  }
  // #endregion
}
