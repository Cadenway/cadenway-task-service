/**
 * Interface PurgeTrashOutput
 *
 * @description
 * What the erasure of the trash of an organization did, with counts only.
 */
export interface PurgeTrashOutput {
  // #region Properties
  /** The trash entries this run erased. */
  readonly entries: number;

  /** The tasks this run erased, of every entry. */
  readonly tasks: number;

  /** The tombstones of deleted lists this run erased, left without a task. */
  readonly listsPurged: number;

  /** The tombstones of deleted spaces this run erased, left without a list. */
  readonly spacesPurged: number;

  /** The batches this run committed; the closing call, which finds nothing left, is not counted. */
  readonly batches: number;
  // #endregion
}
