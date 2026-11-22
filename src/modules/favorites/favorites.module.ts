import { Idempotent } from '@cadenway/nest-common/database';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { FavoriteReplayAccessInterceptor } from './composition/providers/adapters/favorite/favorites-replay-access.provider.js';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { SavedViewsModule } from '../saved-views/saved-views.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { favoriteDirectoryProvider } from './composition/providers/adapters/favorite/favorite-directory.provider.js';
import { favoritesUnitOfWorkProvider } from './composition/providers/adapters/favorite/favorites-unit-of-work.provider.js';
import { createFavoriteProvider } from './composition/providers/use-cases/favorite/create-favorite.provider.js';
import { deleteFavoriteProvider } from './composition/providers/use-cases/favorite/delete-favorite.provider.js';
import { getFavoriteProvider } from './composition/providers/use-cases/favorite/get-favorite.provider.js';
import { listFavoritesProvider } from './composition/providers/use-cases/favorite/list-favorites.provider.js';
import { purgeMemberFavoritesProvider } from './composition/providers/use-cases/purge/purge-member-favorites.provider.js';
import { purgeTargetFavoritesProvider } from './composition/providers/use-cases/purge/purge-target-favorites.provider.js';
import { FavoritesController } from './presentation/http/controllers/favorite/favorites.controller.js';
import { PurgeMemberFavorites } from './public/purge/purge-member-favorites.js';
import { PurgeTargetFavorites } from './public/purge/purge-target-favorites.js';

const creation = Object.getOwnPropertyDescriptor(FavoritesController.prototype, 'create');
if (creation === undefined) {
  throw new Error('The favorites creation handler is missing.');
}
Idempotent()(FavoritesController.prototype, 'create', creation);

/** Wires the current user's HTTP collection and member lifecycle cleanup. */
@Module({
  imports: [OrganizationMembersModule, SavedViewsModule, SpacesModule],
  controllers: [FavoritesController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: FavoriteReplayAccessInterceptor },
    favoritesUnitOfWorkProvider,
    favoriteDirectoryProvider,
    createFavoriteProvider,
    deleteFavoriteProvider,
    getFavoriteProvider,
    listFavoritesProvider,
    purgeMemberFavoritesProvider,
  ],
  exports: [PurgeMemberFavorites],
})
export class FavoritesModule {}

/** Supplies target cleanup to owners without reversing the visibility lookup dependencies. */
@Global()
@Module({
  providers: [favoritesUnitOfWorkProvider, purgeTargetFavoritesProvider],
  exports: [PurgeTargetFavorites],
})
export class FavoritesStorageModule {}
