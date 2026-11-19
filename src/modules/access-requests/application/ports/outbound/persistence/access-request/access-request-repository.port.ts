import type { AccessRequest } from '../../../../../domain/aggregates/access-request/access-request.aggregate.js';
import type { AccessRequestDraft } from '../../../../../domain/value-objects/access-request/access-request-draft.value-object.js';
import type { PendingScope } from '../../../../models/access-request/pending-scope.model.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';

/**
 * Interface AccessRequestRepository
 *
 * @description
 * The requests for access of one organization, in the transaction of its unit of work. Every
 * method takes the organization of the transaction and filters on it.
 */
export interface AccessRequestRepository {
  // #region Methods
  /**
   * Method insertPending
   *
   * @description
   * Stores a pending request, unless the requester already has a pending request for the same
   * target: asking again changes nothing.
   *
   * @param {AccessRequestDraft} draft - The checked request.
   * @returns {Promise<AccessRequest | null>} The stored request, with its id and instant, or `null`
   * when a pending one already exists.
   */
  insertPending(draft: AccessRequestDraft): Promise<AccessRequest | null>;

  /**
   * Method lock
   *
   * @description
   * Loads a request, pending or answered, and locks it until the end of the transaction, so that
   * two answers are serialized and the second sees the first.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the request.
   * @returns {Promise<AccessRequest | null>} The request, or `null`.
   */
  lock(organizationId: string, id: string): Promise<AccessRequest | null>;

  /**
   * Method saveDecision
   *
   * @description
   * Writes the answer of a locked request that was pending.
   *
   * @param {AccessRequest} request - The request, answered.
   * @returns {Promise<void>} Resolves once written.
   * @throws {Error} When the row is no longer pending, which the lock prevents.
   */
  saveDecision(request: AccessRequest): Promise<void>;

  /**
   * Method listPending
   *
   * @description
   * Loads the pending requests of a scope, the most recent first `(created_at desc, id desc)`,
   * after a position.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {PendingScope} scope - What the member answers, and the filters.
   * @param {PagePosition | null} after - Where the page starts, `null` for the first.
   * @param {number} limit - Most requests to return.
   * @returns {Promise<readonly AccessRequest[]>} The requests, at most `limit`.
   */
  listPending(
    organizationId: string,
    scope: PendingScope,
    after: PagePosition | null,
    limit: number,
  ): Promise<readonly AccessRequest[]>;

  /**
   * Method countPending
   *
   * @description
   * Counts the pending requests of a scope.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {PendingScope} scope - What the member answers, and the filters.
   * @returns {Promise<number>} How many.
   */
  countPending(organizationId: string, scope: PendingScope): Promise<number>;

  /**
   * Method lockPendingOf
   *
   * @description
   * Locks the first pending requests of a requester, in id order, until the end of the
   * transaction.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} requesterUserId - The account.
   * @param {number} limit - Most requests to lock.
   * @returns {Promise<readonly string[]>} Their ids.
   */
  lockPendingOf(
    organizationId: string,
    requesterUserId: string,
    limit: number,
  ): Promise<readonly string[]>;

  /**
   * Method deleteRequests
   *
   * @description
   * Deletes requests by id.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids, locked by the caller.
   * @returns {Promise<number>} How many were deleted.
   */
  deleteRequests(organizationId: string, ids: readonly string[]): Promise<number>;
  // #endregion
}
