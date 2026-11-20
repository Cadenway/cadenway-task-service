/** Verified tenant member and a bounded collection of candidate spaces. */
export interface ResolveGoalSpacesInput {
  // #region Properties
  /** Organization from the verified caller. */
  readonly organizationId: string;

  /** Account whose effective space roles are requested. */
  readonly viewerUserId: string;

  /** Current projected membership role. */
  readonly viewerRole: 'owner' | 'admin' | 'member' | 'guest';

  /** Candidate space identifiers. */
  readonly spaceIds: readonly string[];

  /** Hold candidate spaces until the caller's transaction commits. */
  readonly lock?: boolean;
  // #endregion
}
