import type { SavedView } from '../../aggregates/view/saved-view.entity.js';

/** Arguments for a fresh saved view with a position assigned by the owning transaction. */
export type NewSavedView = Pick<
  SavedView,
  'organizationId' | 'listId' | 'name' | 'icon' | 'configuration' | 'position'
>;
