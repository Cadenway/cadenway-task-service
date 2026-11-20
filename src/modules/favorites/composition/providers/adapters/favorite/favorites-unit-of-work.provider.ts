import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import type { FavoritesUnitOfWork } from '../../../../application/ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import { TenantFavoritesUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/favorite/tenant-favorites.unit-of-work.js';
import { FAVORITES_UNIT_OF_WORK } from '../../../tokens/favorite/favorites-unit-of-work.token.js';

/** Binds the favorites repository to the shared service transaction runner. */
export const favoritesUnitOfWorkProvider: FactoryProvider<FavoritesUnitOfWork> = {
  provide: FAVORITES_UNIT_OF_WORK,
  inject: [TenantTransactionRunner],
  useFactory: (runner: TenantTransactionRunner): FavoritesUnitOfWork =>
    new TenantFavoritesUnitOfWork(runner),
};
