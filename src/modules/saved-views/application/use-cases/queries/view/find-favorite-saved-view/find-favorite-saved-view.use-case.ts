import type { FavoriteSavedView } from '../../../../models/view/favorite-saved-view.model.js';
import type { FavoriteSavedViewRequest } from '../../../../models/view/favorite-saved-view-request.model.js';
import type { FavoriteSavedViewsRequest } from '../../../../models/view/favorite-saved-views-request.model.js';
import type { SavedViewsUnitOfWork } from '../../../../ports/outbound/transactions/view/saved-views-unit-of-work.port.js';

/** Resolves active saved views the current member is allowed to favorite. */
export class FindFavoriteSavedView {
  // #region Constructor
  /** Binds favorite target lookup to the caller's existing tenant transaction. */
  public constructor(private readonly unitOfWork: SavedViewsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Resolves one readable active view, with optional protection through favorite creation. */
  public execute(input: FavoriteSavedViewRequest): Promise<FavoriteSavedView | null> {
    return this.unitOfWork.run(async (store) => {
      const lock = input.lock === true;
      const viewer = await store.findViewer(input, lock);
      if (viewer === null) return null;
      const target = await store.views.findFavoriteTarget(input.organizationId, input.viewId);
      if (target === null) return null;
      const placement = await store.findPlacement(viewer, target.listId, lock);
      if (placement?.archivedAt !== null) return null;
      if (!lock) return target;
      return store.views.findFavoriteTarget(
        input.organizationId,
        target.id,
        target.listId,
        'share',
      );
    });
  }

  /** Resolves the current names of a bounded set of readable active favorite targets. */
  public executeMany(input: FavoriteSavedViewsRequest): Promise<readonly FavoriteSavedView[]> {
    return this.unitOfWork.run(async (store) => {
      if (input.viewIds.length === 0) return [];
      const viewer = await store.findViewer(input, false);
      if (viewer === null) return [];
      const targets = await store.views.findFavoriteTargets(input.organizationId, input.viewIds);
      const listIds = [...new Set(targets.map(({ listId }) => listId))];
      const activeListIds = await store.findActiveListIds(viewer, listIds);
      return targets.filter(({ listId }) => activeListIds.has(listId));
    });
  }
  // #endregion
}
