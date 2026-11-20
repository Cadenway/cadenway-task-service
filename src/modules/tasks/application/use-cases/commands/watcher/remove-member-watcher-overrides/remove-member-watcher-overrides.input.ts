/** The former member of one organization and where the batch starts. */
export interface RemoveMemberWatcherOverridesInput {
  // #region Properties
  /** The organization of the job and its tenant transaction. */
  readonly organizationId: string;

  /** The account whose explicit watcher overrides are removed. */
  readonly userId: string;

  /** The previous batch's last task id, or null for the first batch. */
  readonly afterTaskId: string | null;
  // #endregion
}
