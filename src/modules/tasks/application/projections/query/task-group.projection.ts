/**
 * Interface TaskGroupView
 *
 * @description
 * A group of tasks and how many it holds (`TaskGroup` of the contract).
 */
export interface TaskGroupView {
  // #region Properties
  /** A status key, a priority, an account id or `none`. */
  readonly value: string;

  /** How many tasks the group holds. */
  readonly count: number;
  // #endregion
}
