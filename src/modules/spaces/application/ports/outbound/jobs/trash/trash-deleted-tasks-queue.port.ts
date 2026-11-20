/**
 * Interface TrashDeletedTasksQueue
 *
 * @description
 * The durable job that moves the tasks of a deleted list or space to the trash ("A job then moves
 * the tasks to the trash in bounded batches" of `DELETE /v1/lists/{listId}` and
 * `DELETE /v1/spaces/{spaceId}`), enqueued in the tenant transaction of the deletion: the job
 * exists if and only if the deletion commits, and runs in the organization of that transaction.
 * The deletion-lifecycle module runs it.
 */
export interface TrashDeletedTasksQueue {
  // #region Methods
  /**
   * Method enqueue
   *
   * @description
   * Enqueues the move to the trash of the tasks of one deletion once: enqueuing the same list or
   * space at the same version again while its first job is kept does nothing. The organization is
   * the one of the transaction; it is not a parameter, so it cannot differ from it.
   *
   * @param {{ readonly kind: 'list'; readonly listId: string; readonly version: number } | { readonly kind: 'space'; readonly spaceId: string; readonly version: number }} deletion -
   * The deleted list or space, and its version after the deletion.
   * @returns {Promise<boolean>} `true` when a job was enqueued, `false` for a duplicate.
   * @throws {Error} When the insert fails: the transaction rolls back.
   */
  enqueue(
    deletion:
      | { readonly kind: 'list'; readonly listId: string; readonly version: number }
      | { readonly kind: 'space'; readonly spaceId: string; readonly version: number },
  ): Promise<boolean>;
  // #endregion
}
