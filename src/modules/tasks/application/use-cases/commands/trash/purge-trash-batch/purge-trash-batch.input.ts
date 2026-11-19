/**
 * Interface PurgeTrashBatchInput
 *
 * @description
 * One batch of the erasure of the trash of an organization, which the purge job of the
 * deletion-lifecycle module runs until none is left.
 */
export interface PurgeTrashBatchInput {
  // #region Properties
  /** The organization of the job. */
  readonly organizationId: string;
  // #endregion
}
