import { FavoriteRefusal } from '../../../../models/favorite/favorite-refusal.model.js';
import type { FavoritesUnitOfWork } from '../../../../ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import type { FavoriteDirectory } from '../../../../ports/outbound/targets/favorite/favorite-directory.port.js';
import type { DeleteFavoriteInput } from './delete-favorite.input.js';

/** Removes the caller's visible favorite while holding its target's placement. */
export class DeleteFavorite {
  // #region Constructor
  /** Takes the transaction and owning-module directory ports. */
  public constructor(
    private readonly unitOfWork: FavoritesUnitOfWork,
    private readonly directory: FavoriteDirectory,
  ) {}
  // #endregion

  // #region Methods
  /** Validates membership, target and any ETag condition before removing the row. */
  public async execute(input: DeleteFavoriteInput): Promise<void> {
    await this.unitOfWork.write(async (favorites): Promise<void> => {
      const role = await this.directory.member(input, true);
      const favorite = role === null ? null : await favorites.find(input, input.favoriteId);
      if (role === null || favorite === null) {
        throw new FavoriteRefusal('favorite-not-found');
      }
      if ((await this.directory.hold(input, role, favorite)) === null) {
        throw new FavoriteRefusal('favorite-not-found');
      }
      if (input.expectedVersions !== null && !input.expectedVersions.includes(favorite.version)) {
        throw new FavoriteRefusal('version-mismatch', favorite.version);
      }
      if (!(await favorites.delete(input, favorite.id))) {
        throw new FavoriteRefusal('favorite-not-found');
      }
    });
  }
  // #endregion
}
