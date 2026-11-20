import type { FactoryProvider } from '@nestjs/common';

import type { FavoritesUnitOfWork } from '../../../../application/ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import type { FavoriteDirectory } from '../../../../application/ports/outbound/targets/favorite/favorite-directory.port.js';
import { DeleteFavorite } from '../../../../application/use-cases/commands/favorite/delete-favorite/delete-favorite.use-case.js';
import { FAVORITE_DIRECTORY } from '../../../tokens/favorite/favorite-directory.token.js';
import { FAVORITES_UNIT_OF_WORK } from '../../../tokens/favorite/favorites-unit-of-work.token.js';

/** Wires DeleteFavorite to the tenant transaction and target directory. */
export const deleteFavoriteProvider: FactoryProvider<DeleteFavorite> = {
  provide: DeleteFavorite,
  inject: [FAVORITES_UNIT_OF_WORK, FAVORITE_DIRECTORY],
  useFactory: (unitOfWork: FavoritesUnitOfWork, directory: FavoriteDirectory): DeleteFavorite =>
    new DeleteFavorite(unitOfWork, directory),
};
