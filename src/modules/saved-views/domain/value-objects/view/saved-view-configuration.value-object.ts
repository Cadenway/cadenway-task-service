/** The explicit query and client presentation settings saved with a view. */
export interface SavedViewConfiguration {
  // #region Properties
  /** Identifier of the view layout. */
  layout: string;

  /** Signed server task sort. */
  sort: string;

  /** Grouping key, or null for ungrouped. */
  groupBy: string | null;

  /** Explicit filters, including symbolic assignee choices. */
  filters: { status?: string[]; priority?: string[]; assignee?: string[]; label?: string[] };

  /** Client settings independent of the server task query. */
  presentation?: {
    hiddenBoardStatusKeys?: string[];
    hiddenSheetColumns?: string[];
    sheetSort?: { column: string; direction: string };
  };
  // #endregion
}
