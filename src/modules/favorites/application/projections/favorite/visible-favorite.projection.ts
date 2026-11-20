import type { Favorite } from '../../../domain/aggregates/favorite/favorite.entity.js';

/** Favorite with the name and placement read from its currently visible target. */
export interface VisibleFavorite extends Favorite {
  // #region Properties
  /** Current target name and the parent list of a saved view. */
  readonly target: { readonly name: string; readonly listId?: string };
  // #endregion
}
