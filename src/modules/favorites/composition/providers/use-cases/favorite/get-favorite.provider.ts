import type { FactoryProvider } from '@nestjs/common';

import type { FavoritesUnitOfWork } from '../../../../application/ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import type { FavoriteDirectory } from '../../../../application/ports/outbound/targets/favorite/favorite-directory.port.js';
import { GetFavorite } from '../../../../application/use-cases/queries/favorite/get-favorite/get-favorite.use-case.js';
import { FAVORITE_DIRECTORY } from '../../../tokens/favorite/favorite-directory.token.js';
import { FAVORITES_UNIT_OF_WORK } from '../../../tokens/favorite/favorites-unit-of-work.token.js';

/** Wires GetFavorite to the tenant transaction and target directory. */
export const getFavoriteProvider: FactoryProvider<GetFavorite> = {
  provide: GetFavorite,
  inject: [FAVORITES_UNIT_OF_WORK, FAVORITE_DIRECTORY],
  useFactory: (unitOfWork: FavoritesUnitOfWork, directory: FavoriteDirectory): GetFavorite =>
    new GetFavorite(unitOfWork, directory),
};
