/** A current organization member who can read a task. */
export interface TaskParticipant {
  // #region Properties
  /** The account that identifies and orders this participant. */
  readonly userId: string;

  /** The membership ID in the task's organization. */
  readonly memberId: string;
  // #endregion
}
