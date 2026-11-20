import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import type { ResolveIntakePlacementInput } from './resolve-intake-placement.input.js';
import type { ResolveIntakePlacementOutput } from './resolve-intake-placement.output.js';

/** Resolves a publication destination after its caller has authenticated the publication key. */
export class ResolveIntakePlacement {
  // #region Properties
  /** Applies the ordinary space and list grant policies. */
  private readonly access = new AccessResolver();
  // #endregion

  // #region Constructor
  /** Joins the tenant transaction owned by the caller. */
  public constructor(private readonly work: SpacesUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Reads the list again after locking its space and list, in that order. */
  public async execute(
    input: ResolveIntakePlacementInput,
  ): Promise<ResolveIntakePlacementOutput | null> {
    return this.work.run(async (store): Promise<ResolveIntakePlacementOutput | null> => {
      const preview = await store.lists.find(input.organizationId, input.listId);
      if (preview === null) return null;

      const space = input.lock
        ? await store.spaces.lockShared(input.organizationId, preview.snapshot.spaceId)
        : await store.spaces.find(input.organizationId, preview.snapshot.spaceId);
      if (space === null || space.snapshot.awaitingOwner) return null;

      const list = input.lock
        ? await store.lists.lockShared(input.organizationId, input.listId)
        : preview;
      if (list?.snapshot.spaceId !== space.snapshot.id) return null;

      const role =
        input.viewer === undefined
          ? null
          : (await this.access.resolve(store.grants, input.viewer, space.snapshot, list.snapshot))
              .listRole;
      if (input.viewer !== undefined && role === null) return null;

      return {
        spaceId: space.snapshot.id,
        listName: list.snapshot.name,
        archived: list.snapshot.archivedAt !== null,
        statuses: space.snapshot.statuses,
        role,
      };
    });
  }
  // #endregion
}
