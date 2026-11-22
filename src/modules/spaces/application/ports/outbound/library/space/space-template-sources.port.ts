/** Provides the library's distinct source list IDs in the caller's space write transaction. */
export interface SpaceTemplateSources {
  // #region Methods
  /** Returns null for templates created before source provenance was recorded. */
  execute(organizationId: string, spaceId: string): Promise<readonly (string | null)[]>;
  // #endregion
}
