/**
 * Interface UntrashedTasks
 *
 * @description
 * Which tasks are out of the trash, owned by this module and bound to the public operation
 * `ListUntrashedTaskIds` of the tasks module.
 */
export interface UntrashedTasks {
  // #region Methods
  /**
   * Method untrashedOf
   *
   * @description
   * Reads, in the tenant transaction of the caller, those of the tasks that exist and are not in the
   * trash (live or archived): a task restored from the trash. A task still in the trash or erased is
   * left out. The tasks read are locked `FOR SHARE` until the commit, so a restoration of them waits
   * for the transaction of the caller.
   *
   * @param {string} organizationId - The organization of the context, in lower case.
   * @param {readonly string[]} taskIds - The tasks, any number.
   * @returns {Promise<readonly string[]>} Those out of the trash, in no particular order.
   * @throws {Error} When the read fails: the transaction rolls back.
   */
  untrashedOf(organizationId: string, taskIds: readonly string[]): Promise<readonly string[]>;
  // #endregion
}
