import { FavoriteRefusal } from '../../../../models/favorite/favorite-refusal.model.js';
import type { FavoritesUnitOfWork } from '../../../../ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import type { FavoriteDirectory } from '../../../../ports/outbound/targets/favorite/favorite-directory.port.js';
import type { VisibleFavorite } from '../../../../projections/favorite/visible-favorite.projection.js';
import { favoriteTargetKey } from '../../../../../domain/value-objects/target/favorite-target-key.value-object.js';
import type { GetFavoriteInput } from './get-favorite.input.js';

/** Reads one favorite only when the current owner can read its active target. */
export class GetFavorite {
  // #region Constructor
  /** Takes the transaction and owning-module directory ports. */
  public constructor(
    private readonly unitOfWork: FavoritesUnitOfWork,
    private readonly directory: FavoriteDirectory,
  ) {}
  // #endregion

  // #region Methods
  /** Treats absent membership, ownership and target visibility as the same missing favorite. */
  public async execute(input: GetFavoriteInput): Promise<VisibleFavorite> {
    return this.unitOfWork.read(async (favorites): Promise<VisibleFavorite> => {
      const role = await this.directory.member(input, false);
      const favorite = role === null ? null : await favorites.find(input, input.favoriteId);
      if (role === null || favorite === null) {
        throw new FavoriteRefusal('favorite-not-found');
      }

      const targets = await this.directory.visible(input, role, [favorite]);
      const target = targets.get(favoriteTargetKey(favorite));
      if (target === undefined) {
        throw new FavoriteRefusal('favorite-not-found');
      }
      return { ...favorite, target };
    });
  }
  // #endregion
}
