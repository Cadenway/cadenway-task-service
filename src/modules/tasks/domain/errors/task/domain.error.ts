/**
 * Class DomainError
 *
 * @description
 * Base of the errors the tasks domain throws when a value or a change of a task, its assignees,
 * labels, checklist, subtasks or activity entries would break one of its rules. The application
 * layer decides what each means for a caller (a refusal reason, then a problem of
 * `openapi/internal/task-service.yaml`).
 */
export abstract class DomainError extends Error {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the error after its class.
   *
   * @param {string} message - English description of the refused rule, without any personal value.
   * @constructor
   */
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
  // #endregion
}
