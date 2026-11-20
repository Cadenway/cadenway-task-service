/** Trash details provided only after the tasks module authorized the caller to restore the entry. */
export interface CommentTrashedTaskDetails {
  // #region Properties
  /** Key of the requested task. */
  readonly key: string;

  /** Name of the requested task. */
  readonly name: string;

  /** Trash entry containing the requested task. */
  readonly entryId: string;

  /** Original task at the root of the trash entry. */
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
