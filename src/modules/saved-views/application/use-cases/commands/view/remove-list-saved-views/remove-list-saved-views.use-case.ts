/** Cleans up saved views of lists whose placement the deletion workflow already holds. */
export class RemoveListSavedViews {
  // #region Constructor
  /** Takes a transaction-aware operation to remove views from the affected lists. */
  public constructor(
    private readonly removeLists: (
      organizationId: string,
      listIds: readonly string[],
    ) => Promise<readonly string[]>,
  ) {}
  // #endregion

  // #region Methods
  /** Returns the removed IDs for cleaning up dependent records in the same transaction. */
  public execute(input: {
    organizationId: string;
    listIds: readonly string[];
  }): Promise<readonly string[]> {
    return this.removeLists(input.organizationId, input.listIds);
  }
  // #endregion
}
