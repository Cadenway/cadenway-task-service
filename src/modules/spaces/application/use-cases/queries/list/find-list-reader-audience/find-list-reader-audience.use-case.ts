import {
  listRoleOf,
  organizationListRoleOf,
} from '../../../../../domain/policies/access/access-role.policy.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { FindListReaderAudienceInput } from './find-list-reader-audience.input.js';
import type { FindListReaderAudienceOutput } from './find-list-reader-audience.output.js';

/** Resolves the sources of read access for authorized callers in their tenant snapshot. */
export class FindListReaderAudience {
  // #region Properties
  /** Tenant transaction joined to the caller. */
  private readonly unit: SpacesUnitOfWork;
  // #endregion

  // #region Constructor
  /** Binds the transaction for list, space and grant reads. */
  public constructor(unit: SpacesUnitOfWork) {
    this.unit = unit;
  }
  // #endregion

  // #region Methods
  /** Loads the list and its bounded grant sets, which the caller intersects with current members. */
  public async execute(
    input: FindListReaderAudienceInput,
  ): Promise<FindListReaderAudienceOutput | null> {
    return this.unit.run(async (store): Promise<FindListReaderAudienceOutput | null> => {
      const list = await store.lists.find(input.organizationId, input.listId);
      if (list === null) return null;
      const { spaceId } = list.snapshot;
      const space = await store.spaces.find(input.organizationId, spaceId);
      if (space === null || space.snapshot.awaitingOwner) return null;

      const listGrants = await store.grants.listOf(input.organizationId, {
        kind: 'list',
        spaceId,
        listId: input.listId,
      });
      const allNonGuests = organizationListRoleOf(space.snapshot, list.snapshot) !== null;
      if (allNonGuests) {
        return { allNonGuests, nonGuestIds: [], guestIds: listGrants.map((grant) => grant.userId) };
      }

      const spaceGrants = await store.grants.listOf(input.organizationId, {
        kind: 'space',
        spaceId,
      });
      const listRoles = new Map(listGrants.map((grant) => [grant.userId, grant.role]));
      const spaceRoles = new Map(spaceGrants.map((grant) => [grant.userId, grant.role]));
      const candidates = new Set([
        space.snapshot.ownerUserId,
        ...spaceRoles.keys(),
        ...listRoles.keys(),
      ]);
      const nonGuestIds = [...candidates].filter(
        (userId) =>
          listRoleOf(
            space.snapshot,
            list.snapshot,
            { userId, role: 'member' },
            {
              space: spaceRoles.get(userId) ?? null,
              list: listRoles.get(userId) ?? null,
            },
          ) !== null,
      );
      return { allNonGuests, nonGuestIds, guestIds: [...listRoles.keys()] };
    });
  }
  // #endregion
}
