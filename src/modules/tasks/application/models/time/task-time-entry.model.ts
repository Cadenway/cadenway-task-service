/** A stored work log, without the task key used by the HTTP projection. */
export interface TaskTimeEntry {
  // #region Properties
  /** The stored value. */
  readonly id: string;
  readonly authorUserId: string;
  readonly minutes: number;
  readonly workDate: string;
  readonly note: string | null;
  readonly createdAt: Date;
  // #endregion
}
