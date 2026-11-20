/** Existing tenant viewer and candidate space IDs from their favorites collection. */
export interface FindFavoriteSpacesInput {
  // #region Properties
  /** Tenant of the verified caller. */
  readonly organizationId: string;

  /** Account whose target visibility is being checked. */
  readonly viewerUserId: string;

  /** Current projected membership role of the account. */
  readonly viewerRole: 'owner' | 'admin' | 'member' | 'guest';

  /** Bounded candidates from a favorites collection. */
  readonly spaceIds: readonly string[];

  /** Whether to hold the candidate placements through the caller's write. */
  readonly lock?: boolean;
  // #endregion
}
