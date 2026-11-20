/**
 * Interface TaskTrash
 *
 * @description
 * The trash entry a task belongs to ("Corbeille", `openapi/public/trash.yaml`: "deleting a task
 * moves it and its subtasks at every level to the trash as one entry, which comes back or is
 * erased as a whole"). Every task of one entry shares it; a task without one is not in the trash.
 * When and by whom the entry was made, and its root, belong to the entry itself.
 */
export interface TaskTrash {
  // #region Properties
  /**
   * Property entryId
   *
   * @description
   * Id of the trash entry (`entryId` of `task.trashed.v1` and of `404 task.trashed`).
   *
   * @type {string}
   * @readonly
   */
  readonly entryId: string;
  // #endregion
}
