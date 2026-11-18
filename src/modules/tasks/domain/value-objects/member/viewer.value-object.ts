import type { MemberRole } from './member-role.value-object.js';

/**
 * Interface Viewer
 *
 * @description
 * The actor of a request on tasks: a current member of the organization, with the role the copy
 * of the memberships gives it (decision 4 of the P3a plan). A task is seen by whoever sees its
 * space (`openapi/public/tasks.yaml:15-18`), which the application asks the spaces module with
 * this viewer; a caller the copy does not know is not a viewer.
 */
export interface Viewer {
  // #region Properties
  /**
   * Property userId
   *
   * @description
   * Account of the member.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;

  /**
   * Property role
   *
   * @description
   * Role of the member in the organization of the request.
   *
   * @type {MemberRole}
   * @readonly
   */
  readonly role: MemberRole;
  // #endregion
}
