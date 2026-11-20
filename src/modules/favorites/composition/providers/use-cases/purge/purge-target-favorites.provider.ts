import type { FactoryProvider } from '@nestjs/common';

import type { FavoritesUnitOfWork } from '../../../../application/ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import { PurgeTargetFavorites } from '../../../../application/use-cases/commands/purge/purge-target-favorites/purge-target-favorites.use-case.js';
import { FAVORITES_UNIT_OF_WORK } from '../../../tokens/favorite/favorites-unit-of-work.token.js';

/** Builds the target cleanup operation without requiring target visibility providers. */
export const purgeTargetFavoritesProvider: FactoryProvider<PurgeTargetFavorites> = {
  provide: PurgeTargetFavorites,
  inject: [FAVORITES_UNIT_OF_WORK],
  useFactory: (unitOfWork: FavoritesUnitOfWork): PurgeTargetFavorites =>
    new PurgeTargetFavorites(unitOfWork),
};
