import type { FactoryProvider } from '@nestjs/common';

import type { FavoritesUnitOfWork } from '../../../../application/ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import type { FavoriteDirectory } from '../../../../application/ports/outbound/targets/favorite/favorite-directory.port.js';
import { PurgeMemberFavorites } from '../../../../application/use-cases/commands/purge/purge-member-favorites/purge-member-favorites.use-case.js';
import { FAVORITE_DIRECTORY } from '../../../tokens/favorite/favorite-directory.token.js';
import { FAVORITES_UNIT_OF_WORK } from '../../../tokens/favorite/favorites-unit-of-work.token.js';

/** Wires PurgeMemberFavorites to the tenant transaction and target directory. */
export const purgeMemberFavoritesProvider: FactoryProvider<PurgeMemberFavorites> = {
  provide: PurgeMemberFavorites,
  inject: [FAVORITES_UNIT_OF_WORK, FAVORITE_DIRECTORY],
  useFactory: (
    unitOfWork: FavoritesUnitOfWork,
    directory: FavoriteDirectory,
  ): PurgeMemberFavorites => new PurgeMemberFavorites(unitOfWork, directory),
};
