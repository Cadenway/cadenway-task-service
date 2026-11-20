import type { FactoryProvider } from '@nestjs/common';

import type { FavoritesUnitOfWork } from '../../../../application/ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import type { FavoriteDirectory } from '../../../../application/ports/outbound/targets/favorite/favorite-directory.port.js';
import { CreateFavorite } from '../../../../application/use-cases/commands/favorite/create-favorite/create-favorite.use-case.js';
import { FAVORITE_DIRECTORY } from '../../../tokens/favorite/favorite-directory.token.js';
import { FAVORITES_UNIT_OF_WORK } from '../../../tokens/favorite/favorites-unit-of-work.token.js';

/** Wires CreateFavorite to the tenant transaction and target directory. */
export const createFavoriteProvider: FactoryProvider<CreateFavorite> = {
  provide: CreateFavorite,
  inject: [FAVORITES_UNIT_OF_WORK, FAVORITE_DIRECTORY],
  useFactory: (unitOfWork: FavoritesUnitOfWork, directory: FavoriteDirectory): CreateFavorite =>
    new CreateFavorite(unitOfWork, directory),
};
