import { ResourceGrants } from '../../../domain/aggregates/access/resource-grants.aggregate.js';
import { GrantLimitReachedError } from '../../../domain/errors/access/grant-limit-reached.error.js';
import { GranteeInvalidError } from '../../../domain/errors/access/grantee-invalid.error.js';
import { GuestSpaceForbiddenError } from '../../../domain/errors/access/guest-space-forbidden.error.js';
import { OwnerUnchangeableError } from '../../../domain/errors/access/owner-unchangeable.error.js';
import type { GrantEntry } from '../../../domain/value-objects/access/grant-entry.value-object.js';
import type { GrantsUpdate } from '../../../domain/value-objects/access/grants-update.value-object.js';
import type { GrantedResource } from '../../models/access/granted-resource.model.js';
import type { StoredGrant } from '../../models/access/stored-grant.model.js';
import { SpaceRefusal } from '../../models/space/space-refusal.model.js';

/**
 * Class GrantKeeper
 *
 * @description
 * Rebuilds the grants of a space or a list into the `ResourceGrants` aggregate, applies one change
 * of the domain to them and finds the grant a change left as it was ("Grants" of
 * `openapi/public/access.yaml`). The caller locked the space or the list first, so that two
 * changes of its grants apply one after the other, then stores the grant, takes the next version
 * and appends the event in the same transaction. The rules stay in the domain; this class maps
 * their refusals to those of the use cases.
 */
export class GrantKeeper {
  // #region Methods
  /**
   * Method restore
   *
   * @description
   * Rebuilds the aggregate from the stored grants of a space or a list.
   *
   * @param {GrantedResource} resource - The space or the list.
   * @param {string} ownerUserId - The owner of the space (of the list).
   * @param {readonly StoredGrant[]} stored - Its grants, in the order they were first given.
   * @returns {ResourceGrants} The grants.
   * @throws {InvalidSpaceError} When the stored grants break a rule: a defect.
   */
  public restore(
    resource: GrantedResource,
    ownerUserId: string,
    stored: readonly StoredGrant[],
  ): ResourceGrants {
    return ResourceGrants.restore({
      resource: resource.kind,
      ownerUserId,
      grants: stored.map((grant: StoredGrant): GrantEntry => ({
        userId: grant.userId,
        role: grant.role,
      })),
    });
  }

  /**
   * Method apply
   *
   * @description
   * Calls a change of the domain and maps its refusals to those of the use cases.
   *
   * @param {() => GrantsUpdate} change - The call of `give`, `raise`, `remove` or `revoke`.
   * @returns {GrantsUpdate} The grants after the change.
   * @throws {SpaceRefusal} `grantee-invalid`, `owner-unchangeable`, `guest-space-forbidden` or
   * `grant-limit-reached`.
   */
  public apply(change: () => GrantsUpdate): GrantsUpdate {
    try {
      return change();
    } catch (error: unknown) {
      if (error instanceof GranteeInvalidError) {
        throw new SpaceRefusal({ reason: 'grantee-invalid', userId: error.userId });
      }
      if (error instanceof OwnerUnchangeableError) {
        throw new SpaceRefusal({ reason: 'owner-unchangeable' });
      }
      if (error instanceof GuestSpaceForbiddenError) {
        throw new SpaceRefusal({ reason: 'guest-space-forbidden' });
      }
      if (error instanceof GrantLimitReachedError) {
        throw new SpaceRefusal({ reason: 'grant-limit-reached' });
      }
      throw error;
    }
  }

  /**
   * Method held
   *
   * @description
   * The stored grant of a person whom a change left as they were (the same role again).
   *
   * @param {readonly StoredGrant[]} stored - The grants of the space or the list.
   * @param {string} userId - The person.
   * @returns {StoredGrant} Their grant.
   * @throws {Error} When they hold none, which the domain rules out for an unchanged role.
   */
  public held(stored: readonly StoredGrant[], userId: string): StoredGrant {
    const grant: StoredGrant | undefined = stored.find(
      (candidate: StoredGrant): boolean => candidate.userId === userId,
    );
    if (grant === undefined) {
      throw new Error('An unchanged grant is a stored grant.');
    }
    return grant;
  }
  // #endregion
}
