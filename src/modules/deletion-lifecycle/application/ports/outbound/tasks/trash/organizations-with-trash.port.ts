/**
 * Interface OrganizationsWithTrash
 *
 * @description
 * The organizations whose trash holds something to erase, owned by this module and bound to the
 * public operation `ListOrganizationsWithTrashToPurge` of the tasks module: the only read of the
 * deletion jobs that crosses organizations.
 */
export interface OrganizationsWithTrash {
  // #region Methods
  /**
   * Method page
   *
   * @description
   * Reads one page of the organizations holding an entry due or handed over by "Vider la
   * corbeille", by id, in a read-only system transaction of its own, outside any organization
   * context. Ids only.
   *
   * @param {string | null} after - The last organization of the previous page, `null` for the
   * first.
   * @param {number} limit - Most organizations to return, 1 to 1,000.
   * @returns {Promise<readonly string[]>} The organizations, at most `limit`, in id order.
   * @throws {Error} When the read fails.
   */
  page(after: string | null, limit: number): Promise<readonly string[]>;
  // #endregion
}
