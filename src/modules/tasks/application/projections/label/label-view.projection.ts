/**
 * Interface LabelView
 *
 * @description
 * A label of the tasks the actor sees (`Label` of the contract): its name in the spelling that
 * comes first among those of the tasks the actor sees.
 */
export interface LabelView {
  // #region Properties
  /** The name, as spelled. */
  readonly name: string;
  // #endregion
}
