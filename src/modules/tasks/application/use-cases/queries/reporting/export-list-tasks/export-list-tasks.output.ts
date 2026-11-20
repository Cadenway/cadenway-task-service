/** Bounded, escaped export projection for the gateway to enrich and assemble. */
export interface ExportListTasksOutput {
  // #region Properties
  /** Safe filename and complete escaped header line without a line separator. */
  readonly filename: string;
  readonly header: string;

  /** Escaped cells and account IDs in assignment order for each task. */
  readonly rows: readonly {
    readonly beforeAssignees: readonly string[];
    readonly assigneeIds: readonly string[];
    readonly afterAssignees: readonly string[];
  }[];
  // #endregion
}
