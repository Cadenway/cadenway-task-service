import type { SavedView } from '../../../../../domain/aggregates/view/saved-view.entity.js';
import type { SavedViewCreation } from '../../../../models/view/saved-view-creation.model.js';
import type { SavedViewCollection } from '../../../../models/view/saved-view-collection.model.js';
import {
  requireCapacity,
  requireEditable,
  requirePlacement,
} from '../../../../services/view/saved-view-access.service.js';
import type { SavedViewsUnitOfWork } from '../../../../ports/outbound/transactions/view/saved-views-unit-of-work.port.js';

/** Appends a shared view and records its creation in the same tenant transaction. */
export class CreateSavedView {
  // #region Constructor
  /** Binds the operation to the saved-view transaction boundary. */
  public constructor(private readonly unitOfWork: SavedViewsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Validates the current list's capacity and the actor's permission under locks. */
  public execute(input: SavedViewCollection, creation: SavedViewCreation): Promise<SavedView> {
    return this.unitOfWork.run(async (store) => {
      const placement = await requirePlacement(store, input, true);
      requireEditable(placement);
      await store.views.lockListOrder(input.organizationId, input.listId);
      const max = await requireCapacity(store, input);
      const view = await store.views.insert({
        organizationId: input.organizationId,
        listId: input.listId,
        name: creation.name,
        icon: creation.icon ?? null,
        configuration: creation.configuration,
        position: max + 1,
      });
      await store.appendFact(input, placement.spaceId, view, 'created');
      return view;
    });
  }
  // #endregion
}
