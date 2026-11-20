import type { FavoriteOwner } from '../../../../models/collection/favorite-owner.model.js';
import type { FavoritePosition } from '../../../../models/collection/favorite-position.model.js';

/** Caller, validated page size and boundary for their personal collection. */
export interface ListFavoritesInput extends FavoriteOwner {
  // #region Properties
  /** Last visible favorite of the previous page, or null. */
  readonly after: FavoritePosition | null;

  /** Maximum number of readable favorites in the response. */
  readonly limit: number;
  // #endregion
}
