/**
 * Interface SpacePrefixRepository
 *
 * @description
 * The prefixes the spaces of an organization use or used, and the counter of task numbers of each
 * (decisions 1 and 2 of the P3a plan): a prefix belongs for good to the first space that took it,
 * and its numbers never go back.
 */
export interface SpacePrefixRepository {
  // #region Methods
  /**
   * Method claim
   *
   * @description
   * Records that a space uses a prefix. A free prefix becomes the space's for good; a prefix the
   * space used before is its own again, with its numbering where it stopped. A concurrent claim of
   * the same free prefix waits for the other transaction, then sees its outcome.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} prefix - The prefix.
   * @param {string} spaceId - The space that takes it.
   * @returns {Promise<boolean>} `true` when the prefix is the space's; `false` when another space of
   * the organization uses or used it.
   */
  claim(organizationId: string, prefix: string, spaceId: string): Promise<boolean>;

  /**
   * Method nextNumbers
   *
   * @description
   * The number the next task of each prefix would take: one more than the last number given
   * under it, 1 when none was. A preview that reserves nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} prefixes - The prefixes.
   * @returns {Promise<ReadonlyMap<string, number>>} The next number of each prefix asked for.
   */
  nextNumbers(
    organizationId: string,
    prefixes: readonly string[],
  ): Promise<ReadonlyMap<string, number>>;

  /**
   * Method allocate
   *
   * @description
   * Hands out `count` consecutive task numbers under a prefix of a space: the counter advances by
   * `count` in one statement, so concurrent allocations of the prefix never get the same number.
   * The prefix row stays locked until the end of the transaction, which serializes the creations
   * that use it; a rollback gives the numbers back, so no gap is left.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} prefix - The prefix.
   * @param {string} spaceId - The space that must hold the prefix.
   * @param {number} count - How many numbers, at least 1.
   * @returns {Promise<number | null>} The counter after the allocation, which is the last number
   * given, or `null` when the organization has no such prefix held by that space.
   */
  allocate(
    organizationId: string,
    prefix: string,
    spaceId: string,
    count: number,
  ): Promise<number | null>;
  // #endregion
}
