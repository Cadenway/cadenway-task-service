/**
 * Interface TrashOrganizationReader
 *
 * @description
 * The one cross-organization read of the module, in a read-only system transaction: the
 * organizations holding a trash entry to erase. It answers ids only.
 */
export interface TrashOrganizationReader {
  // #region Methods
  /**
   * Method withEntriesToPurge
   *
   * @description
   * Lists the organizations holding an entry handed to the purge by "Vider la corbeille", or an
   * entry still in the trash deleted at or before `dueBefore`, by id, after `after`.
   *
   * @param {Date} dueBefore - The latest deletion instant that is due (`purgeDueBefore`).
   * @param {string | null} after - The last organization of the previous page, `null` for the
   * first.
   * @param {number} limit - How many organizations at most.
   * @returns {Promise<readonly string[]>} Their ids, lower-cased, in ascending order.
   */
  withEntriesToPurge(
    dueBefore: Date,
    after: string | null,
    limit: number,
  ): Promise<readonly string[]>;
  // #endregion
}
