/** Position of a work log in descending creation order. */
export interface TimeEntryPosition {
  // #region Properties
  /** The stored value. */
  readonly createdAt: Date;
  readonly id: string;
  // #endregion
}
