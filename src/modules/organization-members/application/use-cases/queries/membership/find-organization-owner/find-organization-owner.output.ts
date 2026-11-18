/**
 * Interface FindOrganizationOwnerOutput
 *
 * @description
 * The owner of an organization ("Propriétaire"), as the copy of the memberships holds it.
 */
export interface FindOrganizationOwnerOutput {
  // #region Properties
  /**
   * Property memberId
   *
   * @description
   * Id organization-service gave the membership of the owner.
   *
   * @type {string}
   * @readonly
   */
  readonly memberId: string;

  /**
   * Property userId
   *
   * @description
   * Account of the owner.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;
  // #endregion
}
