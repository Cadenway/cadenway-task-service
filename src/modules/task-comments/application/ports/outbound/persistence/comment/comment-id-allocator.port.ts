/** Allocates a UUID v7 in the caller's tenant transaction. */
export interface CommentIdAllocator {
  // #region Methods
  /** Allocates an ID in the currently active tenant transaction. */
  allocate(): Promise<string>;
  // #endregion
}
