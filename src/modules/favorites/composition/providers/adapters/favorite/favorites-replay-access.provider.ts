import { CreateFavoriteInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { ProblemException } from '@cadenway/nest-common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';

import { authorizeIdempotentReplay } from '../../../../../../infrastructure/http/authorize-idempotent-replay.js';
import { GetFavorite } from '../../../../application/use-cases/queries/favorite/get-favorite/get-favorite.use-case.js';
import { FavoritesController } from '../../../../presentation/http/controllers/favorite/favorites.controller.js';
import { answerFavoriteRefusals } from '../../../../presentation/http/errors/favorite/favorite-refusal.problem.js';
import { toFavoriteOwner } from '../../../../presentation/http/mappers/favorite/favorite-owner.mapper.js';

const favoriteReceipt = CreateFavoriteInternalResponse.pick({
  id: true,
  kind: true,
  targetId: true,
});

/** Protects a favorite receipt with current ownership and target visibility. */
@Injectable()
export class FavoriteReplayAccessInterceptor implements NestInterceptor {
  // #region Constructor
  /** Reuses the visibility rules for reading a favorite. */
  public constructor(private readonly favorites: GetFavorite) {}
  // #endregion

  // #region Methods
  /** Authorizes creation receipts after the kit has replayed them. */
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (
      context.getType() !== 'http' ||
      context.getHandler() !== FavoritesController.prototype.create
    ) {
      return next.handle();
    }
    return authorizeIdempotentReplay(
      context,
      next,
      'favorite.target-not-found',
      async (_request, body) => {
        const receipt = favoriteReceipt.safeParse(body);
        if (!receipt.success) {
          throw new ProblemException({ status: 404, code: 'favorite.not-found' });
        }
        const current = await answerFavoriteRefusals(() =>
          this.favorites.execute({ ...toFavoriteOwner(), favoriteId: receipt.data.id }),
        );
        if (current.kind !== receipt.data.kind || current.targetId !== receipt.data.targetId) {
          throw new ProblemException({ status: 404, code: 'favorite.not-found' });
        }
      },
      404,
    );
  }
  // #endregion
}
