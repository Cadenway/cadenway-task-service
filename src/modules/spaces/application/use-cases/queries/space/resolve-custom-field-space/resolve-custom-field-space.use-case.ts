import type { CustomFieldSpaceInput } from '../../../../models/space/custom-field-space-input.model.js';
import type { CustomFieldSpace } from '../../../../models/space/custom-field-space.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';

/** Finds a space role and optionally holds the space through a caller's field mutation. */
export class ResolveCustomFieldSpace {
  // #region Properties
  /** State used by this operation. */
  private readonly access = new AccessResolver();
  // #endregion

  // #region Constructor
  /** Supplies the dependencies of this operation. */

  public constructor(private readonly unitOfWork: SpacesUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Runs the requested field operation. */

  public async execute(input: CustomFieldSpaceInput): Promise<CustomFieldSpace | null> {
    return this.unitOfWork.run(async (store) => {
      const space = input.lock
        ? await store.spaces.lock(input.organizationId, input.spaceId)
        : await store.spaces.find(input.organizationId, input.spaceId);
      if (space === null) return null;
      const viewer = { userId: input.viewerUserId, role: input.viewerRole };
      const access = await this.access.resolve(store.grants, viewer, space.snapshot, null);
      if (access.spaceRole === null) return null;
      return { role: access.spaceRole, canManage: access.canManage };
    });
  }
  // #endregion
}
