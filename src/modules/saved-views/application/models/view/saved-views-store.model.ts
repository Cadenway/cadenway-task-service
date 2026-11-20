import type { SavedView } from '../../../domain/aggregates/view/saved-view.entity.js';
import type { SavedViewRepository } from '../../ports/outbound/persistence/view/saved-view-repository.port.js';
import type { SavedViewCaller } from './saved-view-caller.model.js';
import type { SavedViewCollection } from './saved-view-collection.model.js';
import type { SavedViewPlacement } from './saved-view-placement.model.js';
import type { SavedViewViewer } from './saved-view-viewer.model.js';

/** Transaction-bound collaborators of the saved-view use cases. */
export interface SavedViewsStore {
  // #region Properties
  /** The tenant's saved-view repository. */
  readonly views: SavedViewRepository;
  // #endregion

  // #region Methods
  /** Resolves the current tenant member and optionally locks the membership. */
  findViewer(caller: SavedViewCaller, lock: boolean): Promise<SavedViewViewer | null>;

  /** Resolves the list under current visibility and optionally locks its placement. */
  findPlacement(
    viewer: SavedViewViewer,
    listId: string,
    lock: boolean,
  ): Promise<SavedViewPlacement | null>;

  /** Resolves only currently active lists visible to the viewer. */
  findActiveListIds(
    viewer: SavedViewViewer,
    listIds: readonly string[],
  ): Promise<ReadonlySet<string>>;

  /** Records the mutation fact in the active transaction. */
  appendFact(
    caller: SavedViewCollection,
    spaceId: string,
    view: SavedView,
    action: 'created' | 'updated' | 'deleted',
  ): Promise<void>;

  /** Removes favorite rows for an explicitly deleted view in the same transaction. */
  purgeFavorites(organizationId: string, viewId: string): Promise<void>;
  // #endregion
}
