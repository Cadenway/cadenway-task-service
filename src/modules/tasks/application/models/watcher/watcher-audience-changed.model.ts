/** The preflight did not lock the membership of a candidate found under the task lock. */
export class WatcherAudienceChanged extends Error {
  // #region Constructor
  /** Reports concurrent audience changes without exposing any recipient. */
  public constructor() {
    super('The task audience changed while its locks were acquired.');
    this.name = 'WatcherAudienceChanged';
  }
  // #endregion
}
