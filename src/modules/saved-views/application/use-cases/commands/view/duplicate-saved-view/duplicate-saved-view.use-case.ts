import { duplicateSavedViewName } from '../../../../../domain/aggregates/view/saved-view.entity.js';
import type { SavedView } from '../../../../../domain/aggregates/view/saved-view.entity.js';
import type { SavedViewWrite } from '../../../../models/view/saved-view-write.model.js';
import {
  lockViewForWrite,
  requireCapacity,
} from '../../../../services/view/saved-view-access.service.js';
import type { SavedViewsUnitOfWork } from '../../../../ports/outbound/transactions/view/saved-views-unit-of-work.port.js';

/** Duplicates the explicit settings, inserting the new view immediately after its source. */
export class DuplicateSavedView {
  // #region Constructor
  /** Binds the operation to the saved-view transaction boundary. */
  public constructor(private readonly unitOfWork: SavedViewsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Locks both source version and placement before inserting a freshly identified view. */
  public execute(input: SavedViewWrite): Promise<SavedView> {
    return this.unitOfWork.run(async (store) => {
      const { placement, view } = await lockViewForWrite(store, input);
      await requireCapacity(store, input);
      await store.views.shiftAfter(input.organizationId, input.listId, view.position);
      const duplicate = await store.views.insert({
        organizationId: input.organizationId,
        listId: input.listId,
        name: duplicateSavedViewName(view.name),
        icon: view.icon,
        configuration: view.configuration,
        position: view.position + 1,
      });
      await store.appendFact(input, placement.spaceId, duplicate, 'created');
      return duplicate;
    });
  }
  // #endregion
}
