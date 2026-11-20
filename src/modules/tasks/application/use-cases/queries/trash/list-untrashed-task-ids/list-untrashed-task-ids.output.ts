/**
 * Interface ListUntrashedTaskIdsOutput
 *
 * @description
 * The tasks among the ids asked that exist and are out of the trash, live or archived: their
 * requests stay.
 */
export interface ListUntrashedTaskIdsOutput {
  // #region Properties
  /** Their ids, lower-cased, in no particular order. */
  readonly taskIds: readonly string[];
  // #endregion
}
