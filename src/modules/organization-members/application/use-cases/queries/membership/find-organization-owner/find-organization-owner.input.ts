/**
 * Interface FindOrganizationOwnerInput
 *
 * @description
 * Which organization. `organizationId` is the organization of the caller's verified context, or of
 * the event it handles, the one its tenant transaction runs for: row-level security hides every
 * other organization, so another value finds nothing.
 */
export interface FindOrganizationOwnerInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the verified context.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;
  // #endregion
}
