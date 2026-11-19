import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { GrantedResource } from '../../../../models/access/granted-resource.model.js';
import type { StoredGrant } from '../../../../models/access/stored-grant.model.js';
import type { ViewerGrants } from '../../../../models/access/viewer-grants.model.js';

/**
 * Interface GrantRepository
 *
 * @description
 * The grants of the spaces and lists of the organization of the tenant transaction of a unit of
 * work (`space_grants`, `list_grants`): row-level security limits it to that organization, and
 * every method names it again. A write changes the grants of a space or a list its caller locked.
 */
export interface GrantRepository {
  // #region Methods
  /**
   * Method viewerGrants
   *
   * @description
   * Reads, in one statement, the grant of a member on a space, their grant on one list of it, and
   * whether they hold a grant of any list of the space: three lookups by primary key and by the
   * index of the grants of a person.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @param {string} spaceId - The space.
   * @param {string | null} listId - A list of the space, or `null` for the space alone.
   * @returns {Promise<ViewerGrants>} The grants of the member there.
   */
  viewerGrants(
    organizationId: string,
    viewerUserId: string,
    spaceId: string,
    listId: string | null,
  ): Promise<ViewerGrants>;

  /**
   * Method listOf
   *
   * @description
   * Every grant of a space or a list, in the order they were first given (`created_at`, then the
   * account as tie-breaker): 200 at most, read in one statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {GrantedResource} resource - The space or the list.
   * @returns {Promise<StoredGrant[]>} Its grants.
   */
  listOf(organizationId: string, resource: GrantedResource): Promise<StoredGrant[]>;

  /**
   * Method put
   *
   * @description
   * Gives a person a role on a space or a list, or changes the role they hold there: a new grant
   * is first given now; a changed one keeps when it was first given, and takes the instant and
   * the actor of this change. Called only when the role changes.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {GrantedResource} resource - The space or the list, locked by the caller.
   * @param {string} userId - The person.
   * @param {AccessRole} role - The role.
   * @param {EventActor} actor - Who gives it.
   * @returns {Promise<StoredGrant>} The grant as stored.
   */
  put(
    organizationId: string,
    resource: GrantedResource,
    userId: string,
    role: AccessRole,
    actor: EventActor,
  ): Promise<StoredGrant>;

  /**
   * Method remove
   *
   * @description
   * Removes the grant of a person on a space or a list, if any.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {GrantedResource} resource - The space or the list, locked by the caller.
   * @param {string} userId - The person.
   * @returns {Promise<void>} Resolves once removed.
   */
  remove(organizationId: string, resource: GrantedResource, userId: string): Promise<void>;

  /**
   * Method listOfMember
   *
   * @description
   * The first grants an account holds, for the clean-up of a member who left: its grants of spaces
   * by space, then its grants of lists by space and list, at most `limit`. A removed grant leaves
   * this range, so asking again after the commit returns the next ones.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {number} limit - Most grants to return.
   * @returns {Promise<GrantedResource[]>} What the grants open, at most `limit`.
   */
  listOfMember(organizationId: string, userId: string, limit: number): Promise<GrantedResource[]>;

  /**
   * Method listOfMemberInSpaces
   *
   * @description
   * Every grant an account holds on some spaces and on their lists, grants of spaces first: those
   * a new owner of the spaces held before, which an owner never holds.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {readonly string[]} spaceIds - The spaces, at most one batch of a handover.
   * @returns {Promise<GrantedResource[]>} What the grants open.
   */
  listOfMemberInSpaces(
    organizationId: string,
    userId: string,
    spaceIds: readonly string[],
  ): Promise<GrantedResource[]>;
  // #endregion
}
