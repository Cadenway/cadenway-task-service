/**
 * Interface AllocateTaskKeysOutput
 *
 * @description
 * The numbers handed out: `firstNumber` to `firstNumber + count - 1` under `prefix`, so that the
 * keys are `<prefix>-<firstNumber>` and the `count - 1` that follow.
 */
export interface AllocateTaskKeysOutput {
  // #region Properties
  /**
   * Property prefix
   *
   * @description
   * The current prefix of the space.
   *
   * @type {string}
   * @readonly
   */
  readonly prefix: string;

  /**
   * Property firstNumber
   *
   * @description
   * The first number of the block, at least 1.
   *
   * @type {number}
   * @readonly
   */
  readonly firstNumber: number;
  // #endregion
}
