import type { SavedViewPageRequest } from '../../../../models/view/saved-view-page-request.model.js';
import { requirePlacement } from '../../../../services/view/saved-view-access.service.js';
import type { SavedViewsUnitOfWork } from '../../../../ports/outbound/transactions/view/saved-views-unit-of-work.port.js';

import type { ListSavedViewsOutput } from './list-saved-views.output.js';

/** Lists the shared views of a visible list, retaining order across pages. */
export class ListSavedViews {
  // #region Constructor
  /** Binds the operation to the saved-view transaction boundary. */
  public constructor(private readonly unitOfWork: SavedViewsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Checks the list and looks ahead by one row to determine if there is a next page. */
  public execute(input: SavedViewPageRequest): Promise<ListSavedViewsOutput> {
    return this.unitOfWork.read(async (store) => {
      await requirePlacement(store, input, false);
      const rows = await store.views.page(
        input.organizationId,
        input.listId,
        input.after,
        input.limit + 1,
      );
      const items = rows.slice(0, input.limit);
      const last = rows.length > input.limit ? items.at(-1) : undefined;
      return { items, next: last === undefined ? null : { id: last.id, position: last.position } };
    });
  }
  // #endregion
}
