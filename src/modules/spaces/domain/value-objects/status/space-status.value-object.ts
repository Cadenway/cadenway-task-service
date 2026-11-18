/**
 * Interface SpaceStatus
 *
 * @description
 * How a space shows one status (`SpaceStatus` of `openapi/internal/task-service.yaml`, "Statuts de
 * « Produit »"). Its category is not stored: it follows from the key (`STATUS_CATEGORY_BY_KEY`).
 */
export interface SpaceStatus {
  // #region Properties
  /**
   * Property name
   *
   * @description
   * The name the space gives the status, trimmed, 1 to 24 characters; `null` for its default
   * label, for example "À faire" for `todo`.
   *
   * @type {string | null}
   * @readonly
   */
  readonly name: string | null;

  /**
   * Property hidden
   *
   * @description
   * Whether the space no longer uses the status ("Ne plus utiliser …"): it leaves the status menus
   * and the list groups, but a task that has it keeps it. Always `false` for `todo` and `done`.
   *
   * @type {boolean}
   * @readonly
   */
  readonly hidden: boolean;
  // #endregion
}
