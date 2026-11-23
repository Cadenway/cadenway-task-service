import { Module } from '@nestjs/common';

import { PurgeTargetFavorites } from '../../public/purge/purge-target-favorites.js';
import { favoritesUnitOfWorkProvider } from '../providers/adapters/favorite/favorites-unit-of-work.provider.js';
import { purgeTargetFavoritesProvider } from '../providers/use-cases/purge/purge-target-favorites.provider.js';

/** Supplies target cleanup to owners without reversing the visibility lookup dependencies. */
@Module({
  providers: [favoritesUnitOfWorkProvider, purgeTargetFavoritesProvider],
  exports: [PurgeTargetFavorites],
})
export class FavoritesStorageModule {}
