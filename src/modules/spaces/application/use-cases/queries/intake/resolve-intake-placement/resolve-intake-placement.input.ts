/** A destination and optional verified member in the current tenant. */
export interface ResolveIntakePlacementInput {
  // #region Properties
  /** Organization of the tenant transaction. */
  readonly organizationId: string;

  /** Destination list identifier. */
  readonly listId: string;

  /** Hold the space and list until the caller's transaction commits. */
  readonly lock: boolean;

  /** The caller resolves and, on writes, locks this membership before invoking Spaces. */
  readonly viewer?: {
    readonly userId: string;
    readonly role: 'owner' | 'admin' | 'member' | 'guest';
  };
  // #endregion
}
