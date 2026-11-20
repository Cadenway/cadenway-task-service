/** A validated observation date, IANA zone and completion window. */
export interface GetTeamDashboardInput {
  // #region Properties
  /** Report data and dependencies. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly today: string;
  readonly timeZone: string;
  readonly weeks: 8 | 12;
  // #endregion
}
