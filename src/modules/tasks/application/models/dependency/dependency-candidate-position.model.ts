/** Stable position in the same-list, name and task-key order of candidate tasks. */
export interface DependencyCandidatePosition {
  // #region Properties
  /** Zero for the anchor list and one for any other list. */
  readonly rank: number;

  /** Stored task name. */
  readonly name: string;

  /** Task-key prefix. */
  readonly keyPrefix: string;

  /** Number within the task-key prefix. */
  readonly keyNumber: number;
  // #endregion
}
