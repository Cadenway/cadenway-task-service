import { DomainError } from './domain.error.js';

/**
 * Class TaskInTrashError
 *
 * @description
 * A change of a task in the trash ("A task in the trash is left out of every collection and
 * count; every route of its key answers `404 task.trashed`", `openapi/public/tasks.yaml`, "Trash"):
 * the application refuses it before, with the entry in the details, so reaching the domain is a
 * defect the application maps to `task-not-found`, the answer that leaks nothing.
 */
export class TaskInTrashError extends DomainError {
  // #region Properties
  /**
   * Property key
   *
   * @description
   * The key of the task in the trash.
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
   * Names the task in the trash.
   *
   * @param {string} key - The key of the task.
   * @constructor
   */
  public constructor(key: string) {
    super(`The task ${key} is in the trash: it changes again once its entry is restored.`);
    this.key = key;
  }
  // #endregion
}
