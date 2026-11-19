/**
 * Interface RequestAttemptRepository
 *
 * @description
 * The requests for access each requester took, stored or not, for the hourly limit, in the
 * transaction of its unit of work. Every method takes the organization of the transaction and
 * filters on it; an attempt records no target.
 */
export interface RequestAttemptRepository {
  // #region Methods
  /**
   * Method serialize
   *
   * @description
   * Serializes the requests of one requester in one organization until the end of the
   * transaction, so that two concurrent requests cannot both pass the limit or both store the same
   * request.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The requester.
   * @returns {Promise<void>} Resolves once the transaction holds the requester.
   */
  serialize(organizationId: string, userId: string): Promise<void>;

  /**
   * Method recent
   *
   * @description
   * Reads when the requester asked after an instant, the most recent first.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The requester.
   * @param {Date} after - The start of the window, excluded.
   * @param {number} limit - Most instants to read.
   * @returns {Promise<readonly Date[]>} The instants, at most `limit`.
   */
  recent(
    organizationId: string,
    userId: string,
    after: Date,
    limit: number,
  ): Promise<readonly Date[]>;

  /**
   * Method prune
   *
   * @description
   * Deletes the attempts of the requester that left the window.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The requester.
   * @param {Date} upTo - The start of the window, included.
   * @returns {Promise<void>} Resolves once deleted.
   */
  prune(organizationId: string, userId: string, upTo: Date): Promise<void>;

  /**
   * Method record
   *
   * @description
   * Records one attempt of the requester, at the instant of the transaction.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The requester.
   * @returns {Promise<void>} Resolves once recorded.
   */
  record(organizationId: string, userId: string): Promise<void>;

  /**
   * Method deleteAll
   *
   * @description
   * Deletes every attempt of an account, as when it leaves the organization.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @returns {Promise<void>} Resolves once deleted.
   */
  deleteAll(organizationId: string, userId: string): Promise<void>;
  // #endregion
}
