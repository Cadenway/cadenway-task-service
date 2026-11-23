/** Task keys readable by the verified viewer, in request order. */
export interface GetTaskVisibilityOutput {
  // #region Properties
  /** Unknown, trashed and inaccessible tasks are omitted. */
  readonly visibleTaskKeys: readonly string[];
  // #endregion
}
