/**
 * Interface PurgeTrashInput
 *
 * @description
 * The organization whose trash a `task.purge-trash` job erases. There is no actor: each entry is
 * erased by the person who handed it over with "Vider la corbeille", or by task-service itself
 * once it is due, as the tasks module stored it.
 */
export interface PurgeTrashInput {
  // #region Properties
  /** The organization of the job, in lower case, the one of its organization context. */
  readonly organizationId: string;

  /**
   * Aborted when the attempt can no longer succeed (expired, or abandoned at shutdown): the use
   * case starts no batch after it, and rejects with its reason.
   */
  readonly signal?: AbortSignal;
  // #endregion
}
