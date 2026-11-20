import {
  patchSavedView,
  sameSettings,
} from '../../../../../domain/aggregates/view/saved-view.entity.js';
import type { SavedView } from '../../../../../domain/aggregates/view/saved-view.entity.js';
import { IncompleteSheetSort } from '../../../../../domain/errors/view/incomplete-sheet-sort.error.js';
import { SavedViewError } from '../../../../models/view/saved-view-error.model.js';
import type { SavedViewUpdate } from '../../../../models/view/saved-view-update.model.js';
import type { SavedViewWrite } from '../../../../models/view/saved-view-write.model.js';
import { lockViewForWrite } from '../../../../services/view/saved-view-access.service.js';
import type { SavedViewsUnitOfWork } from '../../../../ports/outbound/transactions/view/saved-views-unit-of-work.port.js';

/** Translates merge failures into the application's stable request error. */
function applyPatch(view: SavedView, patch: SavedViewUpdate): SavedView {
  try {
    return patchSavedView(view, patch);
  } catch (error: unknown) {
    if (error instanceof IncompleteSheetSort)
      throw new SavedViewError({ reason: 'incomplete-sheet-sort' });
    throw error;
  }
}

/** Updates the settings and emits a fact only when the stored view changes. */
export class UpdateSavedView {
  // #region Constructor
  /** Binds the operation to the saved-view transaction boundary. */
  public constructor(private readonly unitOfWork: SavedViewsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Applies the merge patch under the current permissions and item version lock. */
  public execute(input: SavedViewWrite, patch: SavedViewUpdate): Promise<SavedView> {
    return this.unitOfWork.run(async (store) => {
      const { placement, view } = await lockViewForWrite(store, input);
      const patched = applyPatch(view, patch);
      if (sameSettings(view, patched)) return view;
      const updated = await store.views.update({ ...patched, version: view.version + 1 });
      await store.appendFact(input, placement.spaceId, updated, 'updated');
      return updated;
    });
  }
  // #endregion
}
