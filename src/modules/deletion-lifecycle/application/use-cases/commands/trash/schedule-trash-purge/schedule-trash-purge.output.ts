/**
 * Interface ScheduleTrashPurgeOutput
 *
 * @description
 * What one occurrence of the daily schedule enqueued, with counts only.
 */
export interface ScheduleTrashPurgeOutput {
  // #region Properties
  /** The organizations found with an entry due or handed over. */
  readonly organizations: number;

  /** The purge jobs enqueued; an organization enqueued by an earlier attempt is not counted. */
  readonly enqueued: number;

  /** The pages of organizations read, the last, shorter one included. */
  readonly pages: number;
  // #endregion
}
