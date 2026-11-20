import type { SavedViewWrite } from '../../../../models/view/saved-view-write.model.js';
import { lockViewForWrite } from '../../../../services/view/saved-view-access.service.js';
import type { SavedViewsUnitOfWork } from '../../../../ports/outbound/transactions/view/saved-views-unit-of-work.port.js';

/** Removes a view, its private favorite references and the change fact in one transaction. */
export class DeleteSavedView {
  // #region Constructor
  /** Binds the operation to the saved-view transaction boundary. */
  public constructor(private readonly unitOfWork: SavedViewsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Hard-deletes the authorized view after checking the current version. */
  public execute(input: SavedViewWrite): Promise<void> {
    return this.unitOfWork.run(async (store) => {
      const { placement, view } = await lockViewForWrite(store, input);
      await store.views.remove(input.organizationId, input.listId, input.viewId);
      await store.purgeFavorites(input.organizationId, input.viewId);
      await store.appendFact(
        input,
        placement.spaceId,
        { ...view, version: view.version + 1 },
        'deleted',
      );
    });
  }
  // #endregion
}
