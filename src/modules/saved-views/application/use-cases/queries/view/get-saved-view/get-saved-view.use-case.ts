import type { SavedView } from '../../../../../domain/aggregates/view/saved-view.entity.js';
import type { SavedViewItem } from '../../../../models/view/saved-view-item.model.js';
import {
  requirePlacement,
  requireView,
} from '../../../../services/view/saved-view-access.service.js';
import type { SavedViewsUnitOfWork } from '../../../../ports/outbound/transactions/view/saved-views-unit-of-work.port.js';

/** Reads a shared view for someone with any effective role on its list, including archived lists. */
export class GetSavedView {
  // #region Constructor
  /** Binds the operation to the saved-view transaction boundary. */
  public constructor(private readonly unitOfWork: SavedViewsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Resolves visibility and reads the view in one snapshot. */
  public execute(input: SavedViewItem): Promise<SavedView> {
    return this.unitOfWork.read(async (store) => {
      await requirePlacement(store, input, false);
      return requireView(store, input);
    });
  }
  // #endregion
}
