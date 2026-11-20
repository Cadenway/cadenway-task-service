import type { FavoritePosition } from '../../../../models/collection/favorite-position.model.js';
import type { VisibleFavorite } from '../../../../projections/favorite/visible-favorite.projection.js';

/** One page of visible entries and the boundary for the next page, if any. */
export interface ListFavoritesOutput {
  // #region Properties
  /** The visible page in stable creation order. */
  readonly items: readonly VisibleFavorite[];

  /** Last entry of this page if more entries remain. */
  readonly next: FavoritePosition | null;
  // #endregion
}
