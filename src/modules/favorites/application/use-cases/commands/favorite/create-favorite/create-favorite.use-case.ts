import type { Favorite } from '../../../../../domain/aggregates/favorite/favorite.entity.js';
import { FAVORITE_LIMIT } from '../../../../../domain/policies/favorite/favorite-limit.policy.js';
import { FavoriteRefusal } from '../../../../models/favorite/favorite-refusal.model.js';
import type { FavoriteDirectory } from '../../../../ports/outbound/targets/favorite/favorite-directory.port.js';
import type { FavoritesUnitOfWork } from '../../../../ports/outbound/persistence/favorite/favorites-unit-of-work.port.js';
import type { VisibleFavorite } from '../../../../projections/favorite/visible-favorite.projection.js';
import type { CreateFavoriteInput } from './create-favorite.input.js';

/** Adds a readable target while holding the collection, membership and target in that order. */
export class CreateFavorite {
  // #region Constructor
  /** Takes the transaction and owning-module directory ports. */
  public constructor(
    private readonly unitOfWork: FavoritesUnitOfWork,
    private readonly directory: FavoriteDirectory,
  ) {}
  // #endregion

  // #region Methods
  /** Checks target visibility before checking duplication and capacity in the same transaction. */
  public async execute(input: CreateFavoriteInput): Promise<VisibleFavorite> {
    return this.unitOfWork.write(async (favorites): Promise<VisibleFavorite> => {
      await favorites.lockOwner(input);
      const role = await this.directory.member(input, true);
      const target = role === null ? null : await this.directory.hold(input, role, input);
      if (target === null) {
        throw new FavoriteRefusal('target-not-found');
      }

      if (await favorites.has(input, input)) {
        throw new FavoriteRefusal('already-exists');
      }
      if ((await favorites.count(input)) >= FAVORITE_LIMIT) {
        throw new FavoriteRefusal('limit-reached');
      }

      const added: Favorite = await favorites.insert(input, input);
      return { ...added, target };
    });
  }
  // #endregion
}
