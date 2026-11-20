/** A raw list state committed at an observed instant, or the original cutover baseline. */
export interface SprintLifetimeFact {
  // #region Properties
  /** The committed list state and its ordering. */
  readonly sequence: bigint;
  readonly listId: string;
  readonly spaceId: string;
  readonly sprintStartDate: string | null;
  readonly sprintEndDate: string | null;
  readonly deletedAt: Date | null;
  readonly recordedAt: Date;
  readonly baseline: boolean;
  // #endregion
}
