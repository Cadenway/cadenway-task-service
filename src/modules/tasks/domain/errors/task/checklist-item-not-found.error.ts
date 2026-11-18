import { DomainError } from './domain.error.js';

/**
 * Class ChecklistItemNotFoundError
 *
 * @description
 * A tick or an untick of an item the checklist of the task does not hold
 * (`openapi/internal/task-service.yaml:1038-1041` and 1690-1702): `404 checklist-item.not-found`.
 */
export class ChecklistItemNotFoundError extends DomainError {
  // #region Properties
  /**
   * Property checklistItemId
   *
   * @description
   * The id the task does not hold.
   *
   * @type {string}
   * @readonly
   */
  public readonly checklistItemId: string;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Keeps the unknown id, which the message leaves out.
   *
   * @param {string} checklistItemId - The id of the item asked for.
   * @constructor
   */
  public constructor(checklistItemId: string) {
    super('The checklist of the task has no such item.');
    this.checklistItemId = checklistItemId;
  }
  // #endregion
}
