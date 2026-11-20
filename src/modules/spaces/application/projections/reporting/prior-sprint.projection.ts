/** The stable identity and date bounds of one currently readable prior sprint. */
export interface PriorSprint {
  // #region Properties
  /** Sprint identity, display name and local calendar bounds. */
  readonly listId: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  // #endregion
}
