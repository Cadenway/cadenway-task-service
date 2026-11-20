import type { TenantTransactionRunner } from '@cadenway/nest-common/database';

import type { FavoriteRepository } from '../../../../../application/ports/outbound/persistence/favorite/favorite-repository.port.js';
import type { FavoritesUnitOfWork } from '../../../../../application/ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import { DrizzleFavoriteRepository } from '../../repositories/favorite/drizzle-favorite.repository.js';

/** Binds favorites and other module lookups to the active tenant transaction. */
export class TenantFavoritesUnitOfWork implements FavoritesUnitOfWork {
  // #region Constructor
  /** Takes the shared service transaction runner. */
  public constructor(private readonly runner: TenantTransactionRunner) {}
  // #endregion

  // #region Methods
  /** Joins the caller's transaction or opens a read-committed write transaction. */
  public async write<TResult>(
    work: (favorites: FavoriteRepository) => Promise<TResult>,
  ): Promise<TResult> {
    return this.runner.run(({ db }): Promise<TResult> => work(new DrizzleFavoriteRepository(db)));
  }

  /** Resolves owner and active targets against the same repeatable-read snapshot. */
  public async read<TResult>(
    work: (favorites: FavoriteRepository) => Promise<TResult>,
  ): Promise<TResult> {
    return this.runner.run(({ db }): Promise<TResult> => work(new DrizzleFavoriteRepository(db)), {
      isolationLevel: 'repeatable read',
      readOnly: true,
    });
  }
  // #endregion
}
