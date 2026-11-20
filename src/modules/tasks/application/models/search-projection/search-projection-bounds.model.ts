/** Immutable row keys delimiting the remaining part of an export. */
export interface SearchProjectionBounds {
  // #region Properties
  /** Exclusive lower row bound. */
  readonly afterId: string;
  readonly upperId: string;
  // #endregion
}
