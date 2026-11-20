/** Removes library records as their owning spaces and lists are deleted. */
export interface SpaceLibraryCleanup {
  // #region Methods
  /** Permanently removes views and their favorites for the listed tombstones. */
  removeListViews(organizationId: string, listIds: readonly string[]): Promise<void>;

  /** Permanently removes the templates owned by a deleted space. */
  removeSpaceTemplates(organizationId: string, spaceId: string): Promise<void>;

  /** Removes favorites for space or list rows that have been permanently erased. */
  purgeTargetFavorites(
    organizationId: string,
    kind: 'list' | 'space',
    targetIds: readonly string[],
  ): Promise<void>;
  // #endregion
}
