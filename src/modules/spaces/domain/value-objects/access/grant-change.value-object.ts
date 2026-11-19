import type { MemberRole } from '../member/member-role.value-object.js';
import type { AccessRole } from './access-role.value-object.js';

/**
 * Interface GrantChange
 *
 * @description
 * A grant to give: the person, the role, and the role the copy of the memberships gives the person
 * in the organization (`null` when the copy does not hold them as a current member or guest).
 */
export interface GrantChange {
  // #region Properties
  /**
   * Property userId
   *
   * @description
   * Account of the person given access.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;

  /**
   * Property role
   *
   * @description
   * The role to give.
   *
   * @type {AccessRole}
   * @readonly
   */
  readonly role: AccessRole;

  /**
   * Property granteeRole
   *
   * @description
   * Role of the person in the organization, from the copy of the memberships; `null` when it does
   * not hold them.
   *
   * @type {MemberRole | null}
   * @readonly
   */
  readonly granteeRole: MemberRole | null;
  // #endregion
}
