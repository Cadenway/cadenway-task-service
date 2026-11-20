/** Targets to resolve for an already verified current organization member. */
export interface MeasureGoalTargetsInput {
  // #region Properties
  /** Verified tenant, actor and linked identifiers. */
  readonly organizationId: string;
  readonly viewer: {
    readonly userId: string;
    readonly role: 'owner' | 'admin' | 'member' | 'guest';
  };
  readonly listIds: readonly string[];
  readonly milestoneKeys: readonly string[];

  /** Hold target rows and placement permissions until the enclosing write commits. */
  readonly lock: boolean;

  /** Include the goal's own space in the ordered placement locks. */
  readonly scopeSpaceId?: string | null;
  // #endregion
}
