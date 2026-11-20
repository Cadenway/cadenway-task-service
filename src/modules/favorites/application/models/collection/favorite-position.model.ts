/** Immutable ordering key of a favorite. */
export interface FavoritePosition {
  // #region Properties
  /** Favorite ID breaking ties between equal timestamps. */
  readonly id: string;

  /** Favorite creation time. */
  readonly createdAt: Date;
  // #endregion
}
