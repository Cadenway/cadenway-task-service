import type { FavoriteOwner } from '../../../../models/collection/favorite-owner.model.js';

/** An optionally conditional removal from the caller's collection. */
export interface DeleteFavoriteInput extends FavoriteOwner {
  // #region Properties
  /** Identity to remove. */
  readonly favoriteId: string;

  /** Allowed ETag versions, or null for no version restriction. */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
