/** Receives the escaped header and rows without retaining the rest of the export in memory. */
export interface ExportListTasksSink {
  // #region Methods
  /** Starts delivery after selection. Return false if the caller only needs the metadata. */
  start(metadata: {
    readonly filename: string;
    readonly header: string;
  }): boolean | Promise<boolean>;

  /** Writes one row's escaped cells and account IDs, in assignment order. */
  row(row: {
    readonly beforeAssignees: readonly string[];
    readonly assigneeIds: readonly string[];
    readonly afterAssignees: readonly string[];
  }): void | Promise<void>;
  // #endregion
}
