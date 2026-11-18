import { DomainError } from './domain.error.js';

/**
 * Class AssigneeInvalidError
 *
 * @description
 * New assignees who are not current members of the organization, or are guests
 * (`openapi/public/tasks.yaml:35-37`, 115-116 and 1039-1042; `AssigneeInvalid` example,
 * `openapi/public/tasks.yaml:1989-1998`): `422 task.assignee-invalid` with `details.userIds`. A
 * creation lists every invalid account; an assignment names its one account.
 */
export class AssigneeInvalidError extends DomainError {
  // #region Properties
  /**
   * Property userIds
   *
   * @description
   * The refused accounts, each once, in the order of the request: `details.userIds`.
   *
   * @type {readonly string[]}
   * @readonly
   */
  public readonly userIds: readonly string[];
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Keeps the refused accounts, which the message leaves out.
   *
   * @param {readonly string[]} userIds - The refused accounts, at least one.
   * @constructor
   */
  public constructor(userIds: readonly string[]) {
    super('Only current members of the organization other than guests can be assigned.');
    this.userIds = Object.freeze([...userIds]);
  }
  // #endregion
}
