import { FavoriteRefusal } from '../../../../models/favorite/favorite-refusal.model.js';
import type { FavoritesUnitOfWork } from '../../../../ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import type { FavoriteDirectory } from '../../../../ports/outbound/targets/favorite/favorite-directory.port.js';
import type { VisibleFavorite } from '../../../../projections/favorite/visible-favorite.projection.js';
import { favoriteTargetKey } from '../../../../../domain/value-objects/target/favorite-target-key.value-object.js';
import type { ListFavoritesInput } from './list-favorites.input.js';
import type { ListFavoritesOutput } from './list-favorites.output.js';

/** Returns the next page of active readable favorites in stored order. */
export class ListFavorites {
  // #region Constructor
  /** Takes the transaction and owning-module directory ports. */
  public constructor(
    private readonly unitOfWork: FavoritesUnitOfWork,
    private readonly directory: FavoriteDirectory,
  ) {}
  // #endregion

  // #region Methods
  /** Filters targets in one snapshot before finding the page boundary. */
  public async execute(input: ListFavoritesInput): Promise<ListFavoritesOutput> {
    return this.unitOfWork.read(async (favorites): Promise<ListFavoritesOutput> => {
      const role = await this.directory.member(input, false);
      if (role === null) {
        throw new FavoriteRefusal('organization-not-found');
      }

      const stored = await favorites.list(input, input.after);
      const targets = await this.directory.visible(input, role, stored);
      const visible: VisibleFavorite[] = [];
      for (const favorite of stored) {
        const target = targets.get(favoriteTargetKey(favorite));
        if (target !== undefined) {
          visible.push({ ...favorite, target });
        }
        if (visible.length > input.limit) {
          break;
        }
      }

      const end = visible[input.limit - 1];
      return {
        items: visible.slice(0, input.limit),
        next:
          visible.length > input.limit && end !== undefined
            ? { id: end.id, createdAt: end.createdAt }
            : null,
      };
    });
  }
  // #endregion
}
