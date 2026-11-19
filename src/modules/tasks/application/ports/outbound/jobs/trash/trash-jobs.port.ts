/**
 * Interface TrashJobs
 *
 * @description
 * The jobs the trash enqueues (`@cadenway/nest-jobs`), in the tenant transaction of its unit of
 * work: they are stored with the change and run after the commit, or never. The deletion-lifecycle
 * module owns their workers.
 */
export interface TrashJobs {
  // #region Methods
  /**
   * Method dropTrashedTaskRequests
   *
   * @description
   * Enqueues `task.drop-trashed-task-requests` for the tasks of one new entry, once per entry
   * (the occurrence key `entry:<entryId>`): their pending access requests are dropped within
   * seconds, and are hidden until then, since the tasks are no longer found.
   *
   * @param {string} entryId - The entry.
   * @param {readonly string[]} taskIds - Its tasks: 651 live tasks at most, plus the archived
   * subtasks under them.
   * @returns {Promise<void>} Resolves once enqueued, or when it was already.
   */
  dropTrashedTaskRequests(entryId: string, taskIds: readonly string[]): Promise<void>;

  /**
   * Method purgeTrash
   *
   * @description
   * Enqueues one `task.purge-trash` for the organization of the transaction, without occurrence
   * key: two jobs of one organization share the entries through `FOR UPDATE SKIP LOCKED`.
   *
   * @returns {Promise<void>} Resolves once enqueued.
   */
  purgeTrash(): Promise<void>;
  // #endregion
}
