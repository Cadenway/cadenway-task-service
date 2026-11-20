/** Metadata exported to the private-favorites capability. */
export interface FavoriteSavedView {
  // #region Properties
  /** Saved-view identifier. */
  readonly id: string;

  /** Parent list identifier. */
  readonly listId: string;

  /** Name of the currently visible view. */
  readonly name: string;
  // #endregion
}
