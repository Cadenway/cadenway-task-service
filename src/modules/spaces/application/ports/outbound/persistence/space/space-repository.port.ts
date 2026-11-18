import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { SpaceDraft } from '../../../../../domain/value-objects/space/space-draft.value-object.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';

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
   * The spaces a member who is not a guest sees, in the order of their creation (id as
   * tie-breaker), after `after`: those of the whole organization, and the private ones it owns.
   * A space awaiting an owner is never among them, the account recorded as its owner included.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @param {PagePosition | null} after - Where the page starts, `null` for the first page.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<Space[]>} The spaces, at most `limit`.
   */
  listVisible(
    organizationId: string,
    viewerUserId: string,
    after: PagePosition | null,
    limit: number,
  ): Promise<Space[]>;

  /**
   * Method listVisibleIds
   *
   * @description
   * The ids of every space a member who is not a guest sees, in the order of their creation (id as
   * tie-breaker), with the same filter as `listVisible`: those of the whole organization and the
   * private ones the member owns, never one awaiting an owner. Not paged: it is read to filter
   * other collections by space, and the number of spaces of an organization is small.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @returns {Promise<readonly string[]>} The ids of the spaces.
   */
  listVisibleIds(organizationId: string, viewerUserId: string): Promise<readonly string[]>;

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
