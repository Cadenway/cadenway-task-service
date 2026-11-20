import { SavedViewError } from '../../models/view/saved-view-error.model.js';
import type { SavedViewCollection } from '../../models/view/saved-view-collection.model.js';
import type { SavedViewItem } from '../../models/view/saved-view-item.model.js';
import type { SavedViewPlacement } from '../../models/view/saved-view-placement.model.js';
import type { SavedViewWrite } from '../../models/view/saved-view-write.model.js';
import type { SavedViewsStore } from '../../models/view/saved-views-store.model.js';
import type { SavedView } from '../../../domain/aggregates/view/saved-view.entity.js';

/** Loads the caller's current list role and keeps write permissions stable through commit. */
export async function requirePlacement(
  store: SavedViewsStore,
  input: SavedViewCollection,
  lock: boolean,
): Promise<SavedViewPlacement> {
  const viewer = await store.findViewer(input, lock);
  if (viewer === null) throw new SavedViewError({ reason: 'missing-organization' });
  const placement = await store.findPlacement(viewer, input.listId, lock);
  if (placement === null) {
    throw new SavedViewError({ reason: 'viewId' in input ? 'missing-view' : 'missing-list' });
  }
  return placement;
}

/** Requires an editor and a list that is still active. */
export function requireEditable(placement: SavedViewPlacement): void {
  if (placement.role !== 'edit') throw new SavedViewError({ reason: 'role-insufficient' });
  if (placement.archivedAt !== null) throw new SavedViewError({ reason: 'list-archived' });
}

/** Loads a view in its authorized list, optionally locking it until the write completes. */
export async function requireView(
  store: SavedViewsStore,
  input: SavedViewItem,
  lock?: 'update',
): Promise<SavedView> {
  const view = await store.views.read(input.organizationId, input.listId, input.viewId, lock);
  if (view === null) throw new SavedViewError({ reason: 'missing-view' });
  return view;
}

/** Locks the list before item rows and checks If-Match against the locked version. */
export async function lockViewForWrite(
  store: SavedViewsStore,
  input: SavedViewWrite,
): Promise<{ placement: SavedViewPlacement; view: SavedView }> {
  const placement = await requirePlacement(store, input, true);
  await store.views.lockListOrder(input.organizationId, input.listId);
  const view = await requireView(store, input, 'update');
  requireEditable(placement);
  if (input.expectedVersions !== null && !input.expectedVersions.includes(view.version)) {
    throw new SavedViewError({ reason: 'version-mismatch', version: view.version });
  }
  return { placement, view };
}

/** Returns the last position if another saved view fits in the list. */
export async function requireCapacity(
  store: SavedViewsStore,
  input: SavedViewCollection,
): Promise<number> {
  const { count, max } = await store.views.lastPosition(input.organizationId, input.listId);
  if (count >= 50) throw new SavedViewError({ reason: 'limit-reached' });
  return max;
}
