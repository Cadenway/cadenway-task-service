import type { FavoriteOwner } from '../../../../models/collection/favorite-owner.model.js';

/** Caller and favorite ID within their collection. */
export interface GetFavoriteInput extends FavoriteOwner {
  // #region Properties
  /** Identity of the favorite to read. */
  readonly favoriteId: string;
  // #endregion
}
