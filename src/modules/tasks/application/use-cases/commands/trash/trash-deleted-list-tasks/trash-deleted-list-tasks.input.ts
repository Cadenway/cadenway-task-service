/**
 * Interface TrashDeletedListTasksInput
 *
 * @description
 * One batch of the move to the trash of the tasks of a deleted list, which the deletion job of the
 * deletion-lifecycle module runs after the deletion of the list or of its space.
 */
export interface TrashDeletedListTasksInput {
  // #region Properties
  /** The organization of the job. */
  readonly organizationId: string;

  /** The deleted list. */
  readonly listId: string;

  /**
   * The position of the last root of the previous batch (`last` of its output, in the order of
   * the list: creation instant, then id), `null` for the first batch.
   */
  readonly after: { readonly createdAt: Date; readonly id: string } | null;
  // #endregion
}
