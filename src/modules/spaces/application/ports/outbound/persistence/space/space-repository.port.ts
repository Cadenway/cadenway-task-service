import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { SpaceDraft } from '../../../../../domain/value-objects/space/space-draft.value-object.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { SpaceWithGrants } from '../../../../models/access/space-with-grants.model.js';

/**
 * Interface SpaceRepository
 *
 * @description
 * The spaces of the organization of the tenant transaction of a unit of work: row-level security
 * limits it to that organization, and every method names it again.
 */
export interface SpaceRepository {
  // #region Methods
  /**
   * Method insert
   *
   * @description
   * Stores a new space; PostgreSQL gives it its id and its creation instant, and version 1.
   *
   * @param {SpaceDraft} draft - The validated space.
   * @returns {Promise<Space>} The stored space.
   */
  insert(draft: SpaceDraft): Promise<Space>;

  /**
   * Method find
   *
   * @description
   * Loads a space by its id.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the space.
   * @returns {Promise<Space | null>} The space, or `null` when the organization has none with it.
   */
  find(organizationId: string, id: string): Promise<Space | null>;

  /**
   * Method lock
   *
   * @description
   * Loads a space by its id and locks it until the end of the transaction, before a change.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the space.
   * @returns {Promise<Space | null>} The space, or `null`.
   */
  lock(organizationId: string, id: string): Promise<Space | null>;

  /**
   * Method lockShared
   *
   * @description
   * Loads a space by its id and locks it `FOR SHARE` until the end of the transaction, before a
   * change of the grants of one of its lists: the owner of the space cannot change meanwhile, and
   * a change of the space waits for it.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the space.
   * @returns {Promise<Space | null>} The space, or `null`.
   */
  lockShared(organizationId: string, id: string): Promise<Space | null>;

  /**
   * Method lockInOrder
   *
   * @description
   * Loads and locks some spaces until the end of the transaction, one after the other in the order
   * `(created_at, id)`, the order of `lockPrivateOwnedBy`, each `FOR NO KEY UPDATE` (`update`) or
   * `FOR SHARE` (`share`) as asked: two batches that lock spaces, a handover among them, take
   * their common spaces in the same order and never wait on each other in a cycle.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly { readonly id: string; readonly mode: 'update' | 'share' }[]} locks - The
   * spaces and how to lock each.
   * @returns {Promise<Space[]>} The spaces that exist, in the order they were locked.
   */
  lockInOrder(
    organizationId: string,
    locks: readonly { readonly id: string; readonly mode: 'update' | 'share' }[],
  ): Promise<Space[]>;

  /**
   * Method update
   *
   * @description
   * Writes a space locked by `lock` or `lockPrivateOwnedBy` after a change, with its new version.
   *
   * @param {Space} space - The space after the change.
   * @returns {Promise<void>} Resolves once written.
   */
  update(space: Space): Promise<void>;

  /**
   * Method listVisible
   *
   * @description
   * The spaces a member sees ("Who sees a space" of `openapi/public/spaces.yaml`), in the order of
   * their creation (id as tie-breaker), after `after`, each with the grants of the member there:
   * for a member who is not a guest those of the whole organization, the ones it owns and the
   * ones shared with it; for anyone the spaces of the lists shared with it. A space awaiting an
   * owner is never among them.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {PagePosition | null} after - Where the page starts, `null` for the first page.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<SpaceWithGrants[]>} The spaces, at most `limit`.
   */
  listVisible(
    organizationId: string,
    viewer: Viewer,
    after: PagePosition | null,
    limit: number,
  ): Promise<SpaceWithGrants[]>;

  /**
   * Method listAllVisible
   *
   * @description
   * Every space a member sees, with the filter of `listVisible` and in its order, unpaged: the
   * spaces of an organization are few, and the caller needs all of them.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @returns {Promise<SpaceWithGrants[]>} The spaces.
   */
  listAllVisible(organizationId: string, viewer: Viewer): Promise<SpaceWithGrants[]>;

  /**
   * Method lockPrivateOwnedBy
   *
   * @description
   * Loads and locks the first private spaces an account owns and that do not await an owner
   * already, in the order of their creation (id as tie-breaker), at most `limit`. A space handed
   * over or marked awaiting leaves this filter, so asking again after the commit returns the next
   * ones.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} ownerUserId - The account.
   * @param {number} limit - Most spaces to lock.
   * @returns {Promise<Space[]>} Its private spaces, at most `limit`.
   */
  lockPrivateOwnedBy(organizationId: string, ownerUserId: string, limit: number): Promise<Space[]>;

  /**
   * Method lockAwaitingOwner
   *
   * @description
   * Loads and locks the spaces of the organization that await an owner (`awaitingOwner`), in the
   * order of their creation.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @returns {Promise<Space[]>} The spaces awaiting an owner.
   */
  lockAwaitingOwner(organizationId: string): Promise<Space[]>;
  // #endregion
}
