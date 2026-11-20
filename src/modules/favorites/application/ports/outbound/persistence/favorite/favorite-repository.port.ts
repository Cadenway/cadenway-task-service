import type { Favorite } from '../../../../../domain/aggregates/favorite/favorite.entity.js';
import type { FavoriteKind } from '../../../../../domain/value-objects/target/favorite-kind.value-object.js';
import type { FavoriteOwner } from '../../../../models/collection/favorite-owner.model.js';
import type { FavoritePosition } from '../../../../models/collection/favorite-position.model.js';
import type { FavoriteTarget } from '../../../../models/target/favorite-target.model.js';

/** Transaction-scoped persistence for favorites. */
export interface FavoriteRepository {
  // #region Methods
  /** Serializes addition and removed-member cleanup for a single owner. */
  lockOwner(owner: FavoriteOwner): Promise<void>;

  /** Finds an entry by ID within the caller's collection. */
  find(owner: FavoriteOwner, id: string): Promise<Favorite | null>;

  /** Returns every stored entry after the cursor within the collection's hard limit. */
  list(owner: FavoriteOwner, after: FavoritePosition | null): Promise<readonly Favorite[]>;

  /** Checks uniqueness within the collection, including currently hidden rows. */
  has(owner: FavoriteOwner, target: FavoriteTarget): Promise<boolean>;

  /** Counts stored rows, including currently hidden rows. */
  count(owner: FavoriteOwner): Promise<number>;

  /** Adds the target to the collection. */
  insert(owner: FavoriteOwner, target: FavoriteTarget): Promise<Favorite>;

  /** Removes the single row within the collection, returning whether it existed. */
  delete(owner: FavoriteOwner, id: string): Promise<boolean>;

  /** Removes favorites for physically deleted targets across owners in one tenant. */
  purgeTargets(
    organizationId: string,
    kind: FavoriteKind,
    targetIds: readonly string[],
  ): Promise<void>;

  /** Removes all favorites owned by a removed member. */
  purgeOwner(owner: FavoriteOwner): Promise<void>;
  // #endregion
}
