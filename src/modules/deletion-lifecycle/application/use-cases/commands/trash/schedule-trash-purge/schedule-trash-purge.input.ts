/**
 * Interface ScheduleTrashPurgeInput
 *
 * @description
 * One occurrence of the daily schedule of the purge, a job without organization.
 */
export interface ScheduleTrashPurgeInput {
  // #region Properties
  /**
   * The id of the scheduled job, the same for each of its attempts: the occurrence of the purge
   * jobs it enqueues.
   */
  readonly jobId: string;

  /**
   * Aborted when the attempt can no longer succeed (expired, or abandoned at shutdown): the use
   * case reads and enqueues no page after it, and rejects with its reason.
   */
  readonly signal?: AbortSignal;
  // #endregion
}
