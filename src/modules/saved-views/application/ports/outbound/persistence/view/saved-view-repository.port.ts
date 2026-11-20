import type { SavedView } from '../../../../../domain/aggregates/view/saved-view.entity.js';
import type { NewSavedView } from '../../../../../domain/value-objects/view/new-saved-view.value-object.js';
import type { FavoriteSavedView } from '../../../../models/view/favorite-saved-view.model.js';
import type { SavedViewPosition } from '../../../../models/view/saved-view-position.model.js';

/** Saved-view persistence restricted to the current tenant transaction. */
export interface SavedViewRepository {
  // #region Methods
  /** Serializes view writes and ordering within the same list. */
  lockListOrder(organizationId: string, listId: string): Promise<void>;

  /** Checks capacity and finds the last slot for append. */
  lastPosition(organizationId: string, listId: string): Promise<{ count: number; max: number }>;

  /** Reads a view, with a lock when editing or deleting it. */
  read(
    organizationId: string,
    listId: string,
    viewId: string,
    lock?: 'update',
  ): Promise<SavedView | null>;

  /** Lists one bounded ordered slice of the current list. */
  page(
    organizationId: string,
    listId: string,
    after: SavedViewPosition | null,
    limit: number,
  ): Promise<SavedView[]>;

  /** Inserts a fresh view with its assigned position. */
  insert(view: NewSavedView): Promise<SavedView>;

  /** Opens a new slot immediately after the source position. */
  shiftAfter(organizationId: string, listId: string, position: number): Promise<void>;

  /** Persists the view after it was checked and locked. */
  update(view: SavedView): Promise<SavedView>;

  /** Removes a saved view from its list. */
  remove(organizationId: string, listId: string, viewId: string): Promise<void>;

  /** Removes views of locked lists and returns their IDs. */
  removeLists(organizationId: string, listIds: readonly string[]): Promise<readonly string[]>;

  /** Resolves one favorite target and may hold it through commit. */
  findFavoriteTarget(
    organizationId: string,
    viewId: string,
    listId?: string,
    lock?: 'share',
  ): Promise<FavoriteSavedView | null>;

  /** Resolves favorite projections for a bounded set of views. */
  findFavoriteTargets(
    organizationId: string,
    viewIds: readonly string[],
  ): Promise<readonly FavoriteSavedView[]>;
  // #endregion
}
