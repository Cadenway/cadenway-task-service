/**
 * Interface KeyAllocation
 *
 * @description
 * The task keys the spaces module reserved for the transaction: `count` consecutive numbers from
 * `firstNumber`, under the prefix of the space.
 */
export interface KeyAllocation {
  // #region Properties
  /** The prefix of the space. */
  readonly prefix: string;

  /** The first number reserved. */
  readonly firstNumber: number;
  // #endregion
}
