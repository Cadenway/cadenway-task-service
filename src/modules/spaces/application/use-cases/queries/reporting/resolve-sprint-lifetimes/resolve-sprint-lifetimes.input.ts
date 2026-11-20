/** Already selected sprint metadata and the verified report observation. */
export interface ResolveSprintLifetimesInput {
  // #region Properties
  /** The verified viewer and the report observation. */
  readonly organizationId: string;
  readonly viewerUserId: string;
  readonly viewerRole: 'owner' | 'admin' | 'member' | 'guest';
  readonly coverageStartedAt: Date | null;
  readonly observedAt: Date;

  /** A PostgreSQL snapshot authenticated and bound to this report by the caller. */
  readonly snapshot: string;

  /** The current and prior sprint descriptions selected by the report. */
  readonly sprints: readonly {
    readonly listId: string;
    readonly spaceId: string;
    readonly name: string;
    readonly startDate: string;
    readonly endDate: string;
  }[];
  // #endregion
}
