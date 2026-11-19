/**
 * Interface ListOrganizationsWithTrashToPurgeInput
 *
 * @description
 * A page of the organizations holding trash to erase, which the daily schedule of the purge of the
 * deletion-lifecycle module reads.
 */
export interface ListOrganizationsWithTrashToPurgeInput {
  // #region Properties
  /** The last organization of the previous page, `null` for the first. */
  readonly after: string | null;

  /** How many organizations at most, 1 to 1,000. */
  readonly limit: number;
  // #endregion
}
