import type { MemberRole } from './member-role.value-object.js';

/**
 * Interface AssigneeCandidate
 *
 * @description
 * An account to assign, with the role the copy of the memberships gives it in the organization of
 * the task, read by the application in the same transaction (`openapi/public/tasks.yaml:35-37`;
 * decision 4 of the P3a plan). The domain decides from it whether the account may become an
 * assignee (`assignability.policy.ts`).
 */
export interface AssigneeCandidate {
  // #region Properties
  /**
   * Property userId
   *
   * @description
   * The account.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;

  /**
   * Property role
   *
   * @description
   * Its role in the organization, or `null` when the copy does not hold it as a current member.
   *
   * @type {MemberRole | null}
   * @readonly
   */
  readonly role: MemberRole | null;
  // #endregion
}
