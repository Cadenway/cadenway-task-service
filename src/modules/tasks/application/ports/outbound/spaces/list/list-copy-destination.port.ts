import type { PlacedList } from '../../../../models/placement/placed-list.model.js';

/** Creates an ordinary list using the source look and access switch. */
export interface ListCopyDestination {
  // #region Methods
  /** Creates the list in the caller's tenant transaction. */
  create(organizationId: string, actorUserId: string, sourceListId: string): Promise<PlacedList>;
  // #endregion
}
