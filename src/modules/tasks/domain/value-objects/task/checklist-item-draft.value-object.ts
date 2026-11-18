/**
 * Interface ChecklistItemDraft
 *
 * @description
 * A checked new checklist item, what a repository inserts: PostgreSQL assigns its `id`. It is
 * added not ticked, at the end of the checklist (`openapi/public/tasks.yaml:924-925`).
 */
export interface ChecklistItemDraft {
  // #region Properties
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
   * Always `false` for a new item.
   *
   * @type {false}
   * @readonly
   */
  readonly done: false;

  /**
   * Property position
   *
   * @description
   * Rank of the item in the checklist, after every existing item: one more than the last
   * position, 0 for the first item.
   *
   * @type {number}
   * @readonly
   */
  readonly position: number;
  // #endregion
}
