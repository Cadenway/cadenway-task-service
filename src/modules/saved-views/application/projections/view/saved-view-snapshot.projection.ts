import type { SavedView } from '../../../domain/aggregates/view/saved-view.entity.js';

/** Persisted view settings available for mapping into the API representation. */
export type SavedViewSnapshot = Omit<SavedView, 'organizationId' | 'position'>;
