/** Exclusive position in the template library's creation order. */
export interface TaskTemplatePosition {
  // #region Properties
  /** Creation timestamp of the last returned row. */
  readonly createdAt: string;

  /** Tie-breaking identifier of the last returned row. */
  readonly id: string;
  // #endregion
}
