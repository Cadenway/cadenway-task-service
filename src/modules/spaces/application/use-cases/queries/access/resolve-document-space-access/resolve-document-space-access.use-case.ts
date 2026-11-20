import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { DocumentSpaceAccessUnitOfWork } from '../../../../ports/outbound/transactions/access/document-space-access-unit-of-work.port.js';
import type { ResolveDocumentSpaceAccessInput } from './resolve-document-space-access.input.js';
import type { ResolveDocumentSpaceAccessOutput } from './resolve-document-space-access.output.js';

/** Resolves Document's direct-space access proof using current tenant membership. */
export class ResolveDocumentSpaceAccess {
  // #region Constructor
  /** Binds the tenant-scoped read snapshot. */
  public constructor(private readonly unitOfWork: DocumentSpaceAccessUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Rechecks membership even when the requested set of spaces is empty. */
  public async execute(
    input: ResolveDocumentSpaceAccessInput,
  ): Promise<ResolveDocumentSpaceAccessOutput> {
    return this.unitOfWork.read(async (store) => {
      const member = await store.findViewer({
        organizationId: input.organizationId,
        userId: input.viewerUserId,
      });
      if (member === null) throw new SpaceRefusal({ reason: 'organization-not-found' });

      const spaceIds = [...new Set(input.spaceIds.map((id) => id.toLowerCase()))];
      if (spaceIds.length === 0) return { results: [] };

      const spaces = await store.resolveSpaces({
        organizationId: input.organizationId,
        viewerUserId: input.viewerUserId,
        viewerRole: member.role,
        spaceIds,
      });
      const roles = new Map(spaces.map(({ id, role }) => [id.toLowerCase(), role]));
      return {
        results: spaceIds.flatMap((spaceId) => {
          const role = roles.get(spaceId);
          return role === undefined ? [] : [{ spaceId, role }];
        }),
      };
    });
  }
  // #endregion
}
