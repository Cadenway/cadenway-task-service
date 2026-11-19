import type { AccessRole } from '../access/access-role.value-object.js';
import type { MemberRole } from '../member/member-role.value-object.js';
import type { AccessRequestTarget } from './access-request-target.value-object.js';

/**
 * Interface RequesterStanding
 *
 * @description
 * What decides whether a request for access is stored: the kind of target, whether the
 * organization holds it, the role of the requester in the organization and the role they already
 * have on it (on the space for a space, on its list for a list or a task).
 */
export interface RequesterStanding {
  // #region Properties
  /**
   * Property target
   *
   * @description
   * What is asked for.
   *
   * @type {AccessRequestTarget}
   * @readonly
   */
  readonly target: AccessRequestTarget;

  /**
   * Property targetFound
   *
   * @description
   * Whether the organization holds the space, the list or the task.
   *
   * @type {boolean}
   * @readonly
   */
  readonly targetFound: boolean;

  /**
   * Property requesterRole
   *
   * @description
   * The role of the requester in the organization, from the copy of the memberships.
   *
   * @type {MemberRole}
   * @readonly
   */
  readonly requesterRole: MemberRole;

  /**
   * Property roleOnTarget
   *
   * @description
   * The role the requester has on the space of a space target, or on the list of a list or task
   * target; `null` for none or when the target is not found.
   *
   * @type {AccessRole | null}
   * @readonly
   */
  readonly roleOnTarget: AccessRole | null;
  // #endregion
}
