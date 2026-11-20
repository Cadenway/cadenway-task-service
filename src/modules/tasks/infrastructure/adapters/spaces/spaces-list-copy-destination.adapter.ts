import type {
  CreateListCopy,
  CreateListCopyOutput,
} from '../../../../spaces/public/list/create-list-copy.js';
import type { PlacedList } from '../../../application/models/placement/placed-list.model.js';
import type { ListCopyDestination } from '../../../application/ports/outbound/spaces/list/list-copy-destination.port.js';

/** Joins list creation to the tenant transaction that copies the task forest. */
export class SpacesListCopyDestination implements ListCopyDestination {
  // #region Constructor
  /** Takes the spaces module's ordinary copy creation operation. */
  public constructor(private readonly createList: CreateListCopy) {}
  // #endregion

  // #region Methods
  /** Creates the destination list in the open transaction. */
  public async create(
    organizationId: string,
    actorUserId: string,
    sourceListId: string,
  ): Promise<PlacedList> {
    const created: CreateListCopyOutput = await this.createList.execute({
      organizationId,
      actorUserId,
      sourceListId,
    });
    return { ...created };
  }
  // #endregion
}
