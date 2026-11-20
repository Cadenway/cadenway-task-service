/** Position of a milestone in the space page ordered by due date then ID. */
export interface MilestonePosition {
  // #region Properties
  /** Calendar due date, or null for the undated tail. */
  readonly dueDate: string | null;

  /** Internal task ID that breaks ties. */
  readonly id: string;
  // #endregion
}
