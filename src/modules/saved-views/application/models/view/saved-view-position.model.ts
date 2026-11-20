/** Tuple used to resume reading an ordered collection of views. */
export interface SavedViewPosition {
  // #region Properties
  /** Position when the cursor was issued. */
  readonly position: number;

  /** Saved-view identifier of the anchor. */
  readonly id: string;
  // #endregion
}
