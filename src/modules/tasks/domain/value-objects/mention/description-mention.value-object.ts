/** A structured recipient span in a task description, measured in Unicode code points. */
export interface DescriptionMention {
  // #region Properties
  /** Account identified by the mention. */
  readonly userId: string;

  /** Inclusive code-point offset. */
  readonly start: number;

  /** Exclusive code-point offset. */
  readonly end: number;
  // #endregion
}
