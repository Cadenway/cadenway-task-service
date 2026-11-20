/** The result for one explicitly selected task, including a covered descendant. */
export interface BulkTaskResultEntry {
  // #region Properties
  /** The selected task's key. */
  readonly taskKey: string;

  /** The selected task's resulting version, when applicable. */
  readonly version?: number;

  /** The copy's key. */
  readonly newTaskKey?: string;

  /** The copy's initial version. */
  readonly newTaskVersion?: number;

  /** The recurring successor's key. */
  readonly successorKey?: string;

  /** The recurring successor's initial version. */
  readonly successorVersion?: number;

  /** The entry containing the selected task after trashing. */
  readonly trashEntryId?: string;
  // #endregion
}
