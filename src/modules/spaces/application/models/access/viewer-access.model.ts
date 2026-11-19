import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Interface ViewerAccess
 *
 * @description
 * What a member reaches of a space and, when one was asked, of one of its lists, as the policies
 * of `access-role.policy.ts` decide it ("Access" of `openapi/public/spaces.yaml`).
 */
export interface ViewerAccess {
  // #region Properties
  /**
   * Property seesSpace
   *
   * @description
   * Whether the member sees the space (`canSeeSpace`): with a role on it, or through the grant of
   * one of its lists.
   *
   * @type {boolean}
   * @readonly
   */
  readonly seesSpace: boolean;

  /**
   * Property spaceRole
   *
   * @description
   * The role of the member on the space itself (`callerRole` of `Space`), `null` when they see it
   * only through some of its lists, or not at all.
   *
   * @type {AccessRole | null}
   * @readonly
   */
  readonly spaceRole: AccessRole | null;

  /**
   * Property canManage
   *
   * @description
   * Whether the member manages the space (`callerCanManage`).
   *
   * @type {boolean}
   * @readonly
   */
  readonly canManage: boolean;

  /**
   * Property listRole
   *
   * @description
   * The effective role of the member on the list asked for (`callerRole` of `TaskList`); `null`
   * when they do not see it, or when no list was asked.
   *
   * @type {AccessRole | null}
   * @readonly
   */
  readonly listRole: AccessRole | null;
  // #endregion
}
