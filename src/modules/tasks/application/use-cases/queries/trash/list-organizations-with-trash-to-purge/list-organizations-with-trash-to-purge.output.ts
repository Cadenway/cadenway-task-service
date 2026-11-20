/**
 * Interface ListOrganizationsWithTrashToPurgeOutput
 *
 * @description
 * The organizations of the page, by id; fewer than `limit` on the last page.
 */
export interface ListOrganizationsWithTrashToPurgeOutput {
  // #region Properties
  /** Their ids, lower-cased, in ascending order. */
  readonly organizationIds: readonly string[];
  // #endregion
}
