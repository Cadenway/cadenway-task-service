/**
 * Interface FindOrganizationMemberOutput
 *
 * @description
 * The current membership of an account in an organization, as the copy holds it.
 */
export interface FindOrganizationMemberOutput {
  // #region Properties
  /**
   * Property memberId
   *
   * @description
   * Id organization-service gave the membership.
   *
   * @type {string}
   * @readonly
   */
  readonly memberId: string;

  /**
   * Property role
   *
   * @description
   * Role of the account in the organization: `owner`, `admin`, `member` or `guest`.
   *
   * @type {'owner' | 'admin' | 'member' | 'guest'}
   * @readonly
   */
  readonly role: 'owner' | 'admin' | 'member' | 'guest';
  // #endregion
}
