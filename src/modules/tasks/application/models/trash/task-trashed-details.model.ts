/** Details exposed by the task-not-found problem only to a viewer who may restore the entry. */
export interface TaskTrashedDetails {
  // #region Properties
  /** Key of the requested task. */
  readonly key: string;

  /** Name of the requested task. */
  readonly name: string;

  /** Trash entry containing the requested task. */
  readonly entryId: string;

  /** Key of the entry's original root. */
  readonly rootKey: string;

  /** Deletion instant in ISO 8601. */
  readonly trashedAt: string;

  /** Actor that deleted the task. */
  readonly trashedBy: {
    readonly type: 'user' | 'automation' | 'git' | 'system';
    readonly id: string;
  };

  /** Scheduled erasure instant in ISO 8601. */
  readonly purgeAt: string;
  // #endregion
}
