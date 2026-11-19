import { DomainError } from './domain.error.js';

/**
 * Class TaskArchivedError
 *
 * @description
 * A change of an archived task, or of the tree under it ("An archived task ... refuses every
 * change with `409 task.archived`", "Tasks" of `openapi/public/archives.yaml`; `TaskArchived`
 * example, `openapi/internal/task-service.yaml`): `409 task.archived` with `details.key`. The
 * archived task is the task changed, or the parent a new subtask or an attachment names.
 */
export class TaskArchivedError extends DomainError {
  // #region Properties
  /**
   * Property key
   *
   * @description
   * The key of the archived task, as `CAD-430`: `details.key`.
   *
   * @type {string}
   * @readonly
   */
  public readonly key: string;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the archived task.
   *
   * @param {string} key - The key of the archived task.
   * @constructor
   */
  public constructor(key: string) {
    super(`The task ${key} is archived: it changes again once it is restored.`);
    this.key = key;
  }
  // #endregion
}
