/** Current list state with proof for using an unchanged row as its initial state. */
export interface SprintLifetimeCurrent {
  // #region Properties
  /** The current list placement and its sprint dates. */
  readonly listId: string;
  readonly spaceId: string;
  readonly sprintStartDate: string | null;
  readonly sprintEndDate: string | null;
  readonly createdAt: Date;
  readonly unchangedSinceCoverage: boolean;
  // #endregion
}
