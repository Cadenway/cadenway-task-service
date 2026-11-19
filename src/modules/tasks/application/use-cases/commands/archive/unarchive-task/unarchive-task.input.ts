/**
 * Interface UnarchiveTaskInput
 *
 * @description
 * The restoration of the archive a task belongs to.
 */
export interface UnarchiveTaskInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The key of the task, any member of its archive. */
  readonly taskKey: string;

  /** The versions `If-Match` accepts for the task of the path, `null` when absent or `*`. */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
