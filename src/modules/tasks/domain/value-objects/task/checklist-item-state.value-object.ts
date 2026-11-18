/**
 * Interface ChecklistItemState
 *
 * @description
 * A stored checklist item (`ChecklistItem` of `openapi/internal/task-service.yaml:3516-3534`): its
 * text, whether it is ticked, and its rank in the order of addition. This version neither edits,
 * reorders nor removes an item (`openapi/public/tasks.yaml:41-43`).
 */
export interface ChecklistItemState {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * Id of the item.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /**
   * Property text
   *
   * @description
   * "Élément de checklist", trimmed, 1 to 300 characters.
   *
   * @type {string}
   * @readonly
   */
  readonly text: string;

  /**
   * Property done
   *
   * @description
   * Ticked ("Terminer") or not ("Rouvrir").
   *
   * @type {boolean}
   * @readonly
   */
  readonly done: boolean;

  /**
   * Property position
   *
   * @description
   * Rank of the item, a non-negative integer, increasing in the order of addition.
   *
   * @type {number}
   * @readonly
   */
  readonly position: number;
  // #endregion
}
