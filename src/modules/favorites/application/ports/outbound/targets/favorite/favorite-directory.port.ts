import type { FavoriteMemberRole } from '../../../../models/collection/favorite-member-role.model.js';
import type { FavoriteOwner } from '../../../../models/collection/favorite-owner.model.js';
import type { FavoriteTarget } from '../../../../models/target/favorite-target.model.js';
import type { VisibleFavorite } from '../../../../projections/favorite/visible-favorite.projection.js';

/** Resolves active membership and checks targets through their owning modules. */
export interface FavoriteDirectory {
  // #region Methods
  /** Returns the projected membership role, holding it for writes when requested. */
  member(owner: FavoriteOwner, lock: boolean): Promise<FavoriteMemberRole | null>;

  /** Looks up active readable targets in owner-bounded batches. */
  visible(
    owner: FavoriteOwner,
    role: FavoriteMemberRole,
    targets: readonly FavoriteTarget[],
  ): Promise<ReadonlyMap<string, VisibleFavorite['target']>>;

  /** Holds the visible target's parent placement and row through the current transaction. */
  hold(
    owner: FavoriteOwner,
    role: FavoriteMemberRole,
    target: FavoriteTarget,
  ): Promise<VisibleFavorite['target'] | null>;
  // #endregion
}
